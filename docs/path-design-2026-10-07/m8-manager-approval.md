# Picked m8 — A dish needs a manager: "Raised Flag", refined

Moment m8, on the counter tablet (1366×1024 landscape, light, device language "Both": Burmese leads, English
echoes beneath or after). A cooked Mohinga on Table 7 came out wrong. Thiri (server) wants it off the bill;
only a manager or the owner may say yes, and never the person who asked (S2 D3). Aye is the one active
manager with a tablet PIN. Later, the guest at Table 7 asks to pay at the counter while the request is still
open.

**Backbone: GLANCEABLE ("Raised Flag").** Owner answer 1: staff moments are glanceable. Every state of a loss
has one silhouette that reads from a step away, and each silhouette also carries a word (never colour alone):

- **Asked:** a small **flag** glyph beside the request, and the dish's own kind mark (a minus-square for
  Remove, a gift disc for Make it free).
- **Deciding:** two names on one slip, **Thiri → Aye**, then Aye's PIN, then two keys that ARE the decision.
- **Decided:** a receipt row, **✓ disc** (removed), **gift disc** (on the house) or **✕ square** (kept).

**Owner answer 4 is built in.** If a dish still waits when the guest is ready to pay, Take payment shows a
paper card that names the dish and the consequence. Its hero is **"Decide it here"**; beside it,
**"Take payment anyway"** is always possible. The dish stays charged, and a later yes becomes a refund in
Today's payments & refunds. Nobody is ever blocked.

**The judges' fixes for this backbone** (m8.json → judgement.scores[2].note and grafts):

- **No nagging marks.** Glanceable's band, its pennants on tiles, floor cards, lines and the warn-tone bar
  pill are all gone. The flag lives only where a decision is made: on the request card and at Take
  payment. The bar keeps today's approvals circle; only its count becomes live.
- **Nothing louder than Late.** The Take payment card is paper with one warm glyph square, not a warn slab,
  and it has no left rail.
- **The picker lists only people who can sign** (active manager or owner, a PIN set, not the asker).
- **Enter never submits when two verbs share the PIN field.** The region says "Choose Approve or Deny."
- **A paid table gets an honest close-only card** instead of an Approve that fails with "no longer open".
- **"One chip = what + why" no longer prints two identical chips.** Every chip wears its column's kind mark,
  so the two "Quality / guest unhappy" and the two "Other" chips never look alike.
- **The gate never fails closed on the roster.** An unreadable roster still offers "Decide it here" (with
  Try again), and "Take payment anyway" is always there.
- **The asker seam is consistent:** it ships ON behind one constant, as the judges sequenced it.

**Grafted from QUIET ("Quiet Countersign"):**

- **Two true names on one slip.** The asker's line reuses the shipped words the manager already reads on
  the card, "{x} က တောင်းထား / from {x}", so both ends print the same sentence.
- **The PIN is the signature, not an "are you sure?".** The confirm stage and its five keys are removed.
- **The fewest new claims.** The false "none are signed in right now" is retired, and no screen quotes a
  drop amount. The bill drops by $15.47 with tax, never "$14.00".
- **The live count on the existing circle**, read from the board's own 5 s snapshot (one poll), with a dashed
  border when the queue freezes.

**Grafted from GUIDED ("The Two-Name Slip"):**

- **The spoken next step.** The PIN field is labelled with the person: **"Aye, your PIN"**. Once a name is
  lit, the screen tells that person exactly what to do.
- **The Take payment pair:** the hero is **"Decide it here"** (the same slip, opened in place) and the
  secondary is **"Take payment anyway"**, with its consequence sentence. This is the S6 gate, softened to a
  warning by owner answer 4.
- **The paid-while-waiting card** says what happened and points to Today's payments & refunds.

**What the best in the world do at this exact moment, brought down to one counter and two parents:**

- **A great maître d'.** The decision is made where the person stands, in one gesture; the signature is the
  confirmation. A guest is never kept waiting for back-office business: payment is never held hostage to a
  manager who is not in the room, because the roster is not presence.
- **A bank's maker–checker.** Two secrets, two people. The list never shows a checker who cannot sign, so the
  rule is visible before anyone types a PIN, never learned from a refusal.
- **A boarding pass.** Origin → destination: **Thiri → Aye**, on one line. The figure you act on (the dish and
  its price) is the biggest thing on the card.
- **The 食券 ticket counter.** The request is one ticket with one figure, printed in the same words on the
  asker's sheet, the manager's card and the till.
- **A great KDS.** State by shape at arm's length; minutes shown, never judged, never coloured.
- **Apple Pay's double-click.** The authentication is the decision: Approve with your PIN in the field IS the
  submit.

All of it stays inside the family's real constraints: no new hardware, no new role, setting or screen (lens
rule 8), owner remote-approve still deferred (ORDER-MODEL), no fabricated times or counts, Burmese-first.

---

## EXAMPLE DATA (measured, not transcribed)

The same example as the m8 artboards (`m8-glance-1`, `m8-glance-2`): Table 7, Mohinga, Thiri asks, Aye
decides.

- **Table 7, dine-in, `table_number` 7.** Its lines (prices from docs/data/MENU_REFERENCE.md, all
  `hot_prepared`):
  - 1× Mohinga / မုန့်ဟင်းခါး $14.00 (:27), state `in_progress` — **the request**;
  - 1× Mee-Shay / မြှီးရှည် $14.00 (:26), `in_progress`;
  - 1× Rice with Pickled Tea Salad / လက်ဖက်ထမင်း $13.00 (:46), `served`;
  - 2× Coconut Rice / အုန်းထမင်း $3.50 = $7.00 (:55), `served`;
  - 1× Ohno Khao-Swe / အုန်းနို့ခေါက်ဆွဲ $15.00 (:29), `served`;
  - 1× Parata (2 pcs) / ပလာတာ $5.00 (:60), `served`.
- **Totals**, computed by the shipped `computeTotals` (lib/totals-math.ts, bundled with esbuild and run on
  these rows):
  - with Mohinga: subtotal **$68.00**, tax **$7.14**, total **$75.14** (`totalCents` 7514);
  - after Mohinga is removed (`voided`) OR made free (`comped`): subtotal $54.00, tax $5.67, total **$59.67**.
  - **The bill drops by $15.47, not $14.00.** So no control or verdict quotes a drop. The trigger re-reads the
    server total ("Updating the total…").
  - The service charge is retired (lib/cart.ts:103); 7 chargeable units (`itemCount`, floor.ts:894).
- **Request A (Table 7):** Remove (`void`), Mohinga, reason `kitchen_error`, from Thiri, cooked, asked
  **6 min** ago.
- **Request B (Table 3):** Make it free (`comp`), 1× Shan Noodles / ရှမ်းခေါက်ဆွဲ $13.00 (MENU_REFERENCE.md:31),
  reason `guest_request` (comp arm → "Guest courtesy"), from Thiri, cooked, asked **2 min** ago.
- **People (sample display names, verbatim):**
  - Thiri, role `server`, has a PIN;
  - Aye, role `manager`, active, PIN set. Aye is the only active manager or owner with a tablet PIN, so
    for Thiri's requests Aye is the one eligible signer.
- **Counts in Burmese prose take Burmese digits** ("စောင့်နေတာ ၂ ခု", RelativeTime "၆ မိနစ်က"), per the
  dictionary's numerals rule (lib/i18n/staff.ts:18-26, `tf`/`localizeCount` in lib/i18n/fill.ts:43-47).
  Money, table numbers and clocks stay Latin.

**Light tokens used (hex, packages/ui/src/tokens.css):**

- **Ground and surfaces:** --pg #faf9f5 · --sunken #efece2 · --sf #f2efe7 · --cd #fffdf8 · --cd-raised #ffffff
- **Ink:** --tx #1b1714 · --t2 #6e6358 · --t3 #726859
- **Accent:** --ac #a65f10 · --ac-strong #8f5009 · --oa #fffdf8
- **Gold:** --gold #e8a83c · --gold-strong #8a5a00
- **Status:** --ok #346e47 · --warn #a44b34 · --warnb #f6e9e4
- **Lines and effects:**
  - --bd rgba(58,35,23,0.1) · --sheen rgba(255,255,255,0.55) · --scrim-glass rgba(15,10,5,0.3)
  - --glow-gold ≈ rgba(232,168,60,0.34)
  - --sh-xl `0 24px 60px rgba(35,24,16,0.16)` · --sh-lift `0 2px 8px -1px rgba(166,95,16,0.42)`
- **Mixes (hex approximated in oklab for the artboard):**
  - the gift disc `color-mix(in oklab, var(--gold) 22%, var(--cd))` ≈ **#fbebd3**;
  - the "you are here" border `color-mix(in oklab, var(--gold) 55%, var(--bd))` ≈ **rgba(228,163,58,0.6)**.
- **Badges** (packages/ui/src/badge.tsx:20-22):
  - "Manager" = jade tone (bg ≈ #d7e3de, ink #1a5e54);
  - "Server" = accent tone (bg ≈ #eee3d5, ink #8f5009).

**Contrast (computed, WCAG; script in the scratchpad):**

| Pair                                     | Ratio |
| ---------------------------------------- | ----- |
| --warn on --warnb (flag glyph, kind)     | 4.87  |
| --warn on --sf (flag on the card strip)  | 5.03  |
| --warn on --cd (kind word, cooked)       | 5.68  |
| --gold-strong on #fbebd3 (gift disc)     | 5.05  |
| --oa on --ok (✓ disc)                    | 5.96  |
| --oa on --ac (lit cap, Approve top)      | 4.84  |
| --oa on --ac-strong (Approve bottom)     | 6.22  |
| --ac-strong on --oa (inverted count pip) | 6.22  |
| --t2 on --cd                             | 5.76  |
| --t3 on --cd                             | 5.38  |
| --t2 on --sf                             | 5.09  |
| --t2 on --warnb                          | 4.93  |
| --tx on --sf                             | 15.50 |

All clear 4.5:1.

In Night (an OS-dark counter), the same geometry uses the .dark tokens:

| Night pair                     | Ratio |
| ------------------------------ | ----- |
| --warn #e0855f on --warnb      | 5.50  |
| --oa #130d1e on --ac #e7a53a   | 8.91  |
| --ok #5fb07e on --cd           | 5.77  |
| --gold on its 22% disc #51434d | 5.93  |

---

## CLAIMS VERIFIED AGAINST THE CODE (HEAD f6e81ce)

Where a claim failed, the design changed, never the claim.

| Claim the design depends on                                                        | Verdict               | Evidence → design consequence                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A cooked line or any comp shows the manager step-up up front                       | TRUE                  | LossActionSheet.tsx:143-147 (`cooked` = in_progress/served; `gatedUpFront`). → The slip shows from the first frame for Mohinga.                                                                                                                                                                                                      |
| The sheet's action defaults to void; the reason is validated inline                | TRUE                  | LossActionSheet.tsx:115, :273-277 (`table.loss.reasonRequired`). → Before a chip, the primary reads "Remove with approval", aria-disabled; a tap says "Pick a reason to continue."                                                                                                                                                   |
| The reason sets differ per action, and two labels repeat across them               | TRUE                  | LossActionSheet.tsx:43-61 (`quality`, `other` shared; `guest_request` forks). → **Every chip carries its column's kind mark**; the duplicates sit on different rows and in differently named groups.                                                                                                                                 |
| The roster filters only role + active (no PIN, no self)                            | TRUE (a gap)          | voids.ts:30-49. → `listApprovers` joins `staff_pins` (keyed `staff_id`, staff-pin.ts:111-121) and returns `hasPin`; a pure `eligibleApprovers(roster, initiatorId)` + `preselect(eligible)` in lib/ with mutants.                                                                                                                    |
| The initiator is always the signed-in caller                                       | TRUE                  | voids.ts:139, approvals.ts:77. → The asker seam (`ASKER_BY_PIN`): the asker's PIN is verified, and its id becomes `p_initiator`. No DDL.                                                                                                                                                                                             |
| Approver = initiator is refused before any lockout budget is spent                 | TRUE                  | staff-pin.ts:16-21; SQL `self_approve` in mms_void_line (20261001000000_p2f…sql:842) and mms_resolve_approval (20260622090000_s2_audit_fixes.sql:174). → The filtered picker can never reach "Pick a manager other than yourself" (staff.ts:2441), which stays only as the server's backstop.                                        |
| The step-up rate bucket keys on the CALLER                                         | TRUE                  | rate.ts:62, staff-pin.ts:22. → Noted risk: the asker seam spends the caller's bucket twice.                                                                                                                                                                                                                                          |
| "none are signed in right now" is true                                             | **FALSE**             | staff.ts:2427-2430 vs voids.ts:34-36 (the roster reads `staff.active`, never sign-in). → Retired. The zero-eligible state says one of glanceable's two true sentences.                                                                                                                                                               |
| A roster READ failure is not an empty roster                                       | TRUE                  | ManagerPinStepUp.tsx:133-214; staff.ts:2437-2440 (K15-HIGH). → Kept verbatim, with its Try again.                                                                                                                                                                                                                                    |
| The manager picker is a `<select>`                                                 | TRUE (replaced)       | ManagerPinStepUp.tsx:340-369. → Name tiles in ONE shared slip component, used by the sheet, the card and the pane.                                                                                                                                                                                                                   |
| A lockout makes the PIN field read-only, never disabled                            | TRUE                  | ManagerPinStepUp.tsx:414-416. → Kept.                                                                                                                                                                                                                                                                                                |
| Approve/Deny open a confirm form with a second confirm key                         | TRUE (removed)        | ApprovalsBoard.tsx:643-746 (`confirmApprove` / `confirmDeny`, staff.ts:523-536). → Retired. The keys are the submit.                                                                                                                                                                                                                 |
| A card's `role=status` exists only while its decision is open                      | TRUE                  | ApprovalsBoard.tsx:747-759 (A4·2's rule). → Kept: Decide opens it.                                                                                                                                                                                                                                                                   |
| The queue polls every 5 s through a poll gate                                      | TRUE                  | ApprovalsBoard.tsx:145-152, :270-277. → The bar circle and the zone-strip chip read this snapshot through context: one poll, not two.                                                                                                                                                                                                |
| The card prints the sticker token                                                  | TRUE (fixed)          | approvals.ts:359-377 (`qr_code`), ApprovalsBoard.tsx:610-614. → It prints `table_number` through `tableDisplay` (floor-types.ts:400-407; column added in 20260713000000_k2_table_registry.sql:8), as a link to the pane (SplitAwareLink.tsx).                                                                                        |
| The queue row carries the initiator id and the cart state                          | FALSE today           | approvals.ts:242-254, :345-347. → `PendingApproval` gains `initiatorStaffId`, `tableNumber`, `cartOpen` (via `mms_approvals.cart_id` → `qr_carts.status`; `cart_id` is already read at approvals.ts:151) and `nameMy` (via `loadLineNames`, lib/line-names.ts:40).                                                                   |
| Deny closes a request on any cart; Approve on a closed cart refuses                | TRUE                  | s2_audit_fixes.sql:181 (deny returns before the cart read), approvals_primitive.sql:140 (`not_open`). → **The paid card is close-only.** "Close it" runs the existing deny path.                                                                                                                                                     |
| Approve applies the line as it stands now                                          | TRUE (M184 open)      | s2_audit_fixes.sql (amount re-derived at resolve); OPEN-ITEMS.md:202. → The card's figure is the request snapshot, so **this ships after M184** (ruling #5). Verdicts carry no amounts.                                                                                                                                              |
| Approve refuses mid-payment                                                        | TRUE                  | approvals.ts:162-172 and the SQL's `in_flight`. → Kept ("That table is mid-payment — try again once they’ve finished.").                                                                                                                                                                                                             |
| The count degrades to a false 0 on error                                           | TRUE (a gap)          | approvals.ts:229-240. → `{ok:false}` instead (graft). The circle can say "couldn't check" and never shows a false all-clear.                                                                                                                                                                                                         |
| The bar's count is computed once per server render                                 | TRUE (a gap)          | app/staff/page.tsx:98-101, :128-149. → Live through the board's snapshot on the counter. The circle, its sr-only name (`floor.nav.approvalsCount`) and the aria-hidden badge are unchanged.                                                                                                                                          |
| The count badge's look                                                             | TRUE                  | globals.css:10657-10674 (18px, --ac, --oa, 11px 800, top/right −4). K43's clip fix is in flight; the artboard draws today's position.                                                                                                                                                                                                |
| Zone chips render Burmese only under `my`/Both, and light with `aria-current`      | TRUE                  | CounterZoneStrip.tsx:108-118 (`<Chrome k>`, no echo); globals.css:7847. → **The glance artboards' English echoes on the strip were wrong**; refined screens draw the strip Burmese-only.                                                                                                                                             |
| The approvals heading and its count line carry no English echo                     | TRUE                  | ApprovalsBoard.tsx:328-351. → Drawn Burmese-only, as shipped.                                                                                                                                                                                                                                                                        |
| The detail marks a pending line, and a failed read degrades silently               | TRUE                  | floor.ts:805-816, :830. → The flag at Take payment reads the same read (extended to select `id, kind, initiator_staff_id`); its silent degrade is an OPEN RISK.                                                                                                                                                                      |
| The settle doors read no `mms_approvals`                                           | TRUE (the hole)       | Only approvals.ts, floor.ts, voids.ts, refunds.ts and the webhook mention it. → The Take payment flag is new: client card plus a server compare of the acknowledged ids.                                                                                                                                                             |
| A staff settle gate already exists as ONE binding, server-refused, dim-and-say     | TRUE                  | checkout-stage.ts:106-132; settle-refusal.ts; FloorDetailLive.tsx:609, :809-830 (`onSettleBlocked`), :1605-1616; CashSettleButton.tsx:596-620 (`blocked`, `blockedNoteId`, `onBlockedTap`). → The flag reuses exactly this wiring, with a second reason.                                                                             |
| aria-disabled buttons dim to .55 and drop their shadow                             | TRUE                  | packages/ui/src/primitives.css:50-54.                                                                                                                                                                                                                                                                                                |
| "ငွေရှင်း" is a small heading with no echo                                         | TRUE                  | FloorDetailLive.tsx:1497-1503, :1798-1802 (13px, --t2); staff.ts:3061.                                                                                                                                                                                                                                                               |
| The cash trigger is xl, block, labelled "Take cash · {m}" stacked                  | TRUE                  | CashSettleButton.tsx:589-643; staff.ts:1708. Its hint: staff.ts:1721-1724, CashSettleButton.tsx:986-994.                                                                                                                                                                                                                             |
| The table shows the guest's ask to pay at the counter                              | TRUE                  | FloorDetailLive.tsx:1468-1480; staff.ts:700-704. → It sits just above Take payment in screen 3.                                                                                                                                                                                                                                      |
| The pane is 464 wide at 1366 and sticky under the bar                              | TRUE                  | globals.css:14676 (`clamp(22rem, 34vw, 34rem)`), :14708-14719 (top 76+16).                                                                                                                                                                                                                                                           |
| On a tablet the sheet is a centred 34rem dialog with no grab handle                | TRUE                  | globals.css:11313-11325 (544 wide, max-height 88dvh = 901). → **The asker's sheet is 544 wide with no grab bar**; the glance artboard's 440 + handle are corrected.                                                                                                                                                                  |
| The sheet head is `--cd-raised` with an inset sheen; ✕ is a 44 target on a 32 disc | TRUE                  | globals.css:233-256, :288-299.                                                                                                                                                                                                                                                                                                       |
| The console has ONE lit cap                                                        | TRUE                  | globals.css:7839-7856.                                                                                                                                                                                                                                                                                                               |
| An echo inside a control takes the control's ink                                   | TRUE                  | globals.css:7516-7524 (`button .chrome-en { color: inherit }`).                                                                                                                                                                                                                                                                      |
| A flag glyph exists                                                                | FALSE                 | icon.tsx:75-97 (gift, check, close, flame, alert, receipt … no flag). → **One new glyph: lucide `Flag`** (lucide is already the icon source). Make it free uses the shipped `gift`, not glanceable's drawn sparkle.                                                                                                                  |
| A paid order's line can be refunded in the app                                     | TRUE                  | refunds.ts:27-35, :360 (`refundLine`, manager + PIN, logged with the name); refund-console.ts:10-29 (cash / in-app / dashboard); the zone heading `#settled-h` (SettledToday.tsx:177, :336). → "A later approval becomes a refund" points there. Ruling #24 (OWNER_RULINGS:70) is about charges with no order behind them, not this. |
| Help exists on the counter bar but not on the standalone table page                | TRUE                  | app/staff/page.tsx:160; app/staff/table/[id]/page.tsx (no HelpButton). → "report it from Help" is said only in the counter pane.                                                                                                                                                                                                     |
| Ages render through `time.*` with Burmese digits                                   | TRUE                  | RelativeTime.tsx; staff.ts:716-719. → "၆ မိနစ်က / 6m ago", never a new "6 min" string.                                                                                                                                                                                                                                               |
| The pending line's badge is quiet --t2 text with no echo                           | TRUE                  | StaffLineEditor.tsx:358-368, :635-640. → Kept as is: no pennant on the line.                                                                                                                                                                                                                                                         |
| Dine-in phones cannot pay by card for now                                          | TRUE (owner answer 2) | The dine-in Bill shows only "Pay at the counter". → Every dine-in payment passes a staff door, so the Take payment flag covers them all.                                                                                                                                                                                             |

---

## THE ONE SLIP (shared by all three screens)

One component (ManagerPinFields, evolved), so the sheet, the request card and the pane print the same thing.

- **Legend** `<legend>`: "မန်နေဂျာ ခွင့်ပြုချက်" (Padauk 700 15) + " · Manager approval" (Hanken 13/600 #6e6358),
  inline.
- **Names row** (64 tall), left to right:
  - **The asker token.** A 28px initial disc (#fffdf8, 1px --bd, Fraunces 14/600) + a stack:
    "{x} က တောင်းထား" (Padauk 700 13) over "from {x}" (12/600 #6e6358). The name is verbatim, marked
    `lang="en"` when Latin. It is plain text. Only on a manager-signed tablet (the seam) does it carry the
    quiet 44px button "{x} မဟုတ်ဘူးလား? ကိုယ့်နာမည်ကို နှိပ်ပါ / Not {x}? Tap your name".
  - **"→"** (Hanken 20, #726859, aria-hidden).
  - **The approver tiles** (`role="group"`, named by the legend). Each tile is a 64px-tall button, min-width
    150, radius 18, padding 0 18 0 14, gap 10: a 32px initial disc (#fffdf8, 1px --bd, Fraunces 17/600
    #1b1714) + the display name (17/700).
    - Idle: --sf, 1px --bd, --tx.
    - Lit: the console's ONE cap: #a65f10, ink #fffdf8, border transparent, inset sheen +
      `0 0 14px -6px rgba(232,168,60,0.34)`; `aria-pressed`.
    - Only ELIGIBLE people render. Exactly one eligible arrives lit; two or more arrive with none lit.
- **PIN row** (52 tall):
  - **The label**, stacked: "{name} ရဲ့ ပင်နံပါတ်" (Padauk 700 14) over "{name}, your PIN" (13/600
    #6e6358). With no name lit it falls back to the shipped "ပင်နံပါတ် / PIN".
  - **The field**: radius 12, #fffdf8, 1px --bd, Hanken 24/800 tabular, letter-spacing .3em,
    `type=password`, `inputMode=numeric`, `autocomplete=off`, `maxLength` 8, placeholder "••••"; `readOnly`
    under a lockout.

---

## SCREEN picked-m8-1.dc.html — The asker's sheet: one chip says what and why, and only people who can sign are listed

**Device:** tablet 1366×1024 landscape. **Theme:** light. **Language mode:** Both. **Route:** `/staff`
(the counter, `?floor=1`) with Table 7's pane open; the loss sheet over it. **Signed in as:** Thiri (Server).

**The state drawn.** Thiri tapped "ဖျက် / အခမဲ့" on Mohinga's row, then lit **"Kitchen made it wrong"** in the
Remove column: one tap, both the action and the reason. Aye is the one person who can sign, so Aye's tile
arrived lit. Aye came over and typed four digits; the keyboard has been dismissed. "Remove with approval" is
armed. The region is empty.

### LAYOUT (frame coordinates, top to bottom)

**① Ground.** #faf9f5, with the staff paper rules (a 1px rgba(27,23,20,0.05) line every 28px).

**② BEHIND THE SCRIM** (inert, `aria-hidden` by the modal, drawn at full fidelity, then blurred):

- **StaffBar y0–76.** #faf9f5, 1px --bd bottom, padding 10 20.
  - The Screens circle, 44, at x20 y16 (#f2efe7, 1px --bd, grid glyph 20).
  - The title at x76: "ကောင်တာနဲ့ စားပွဲများ" (Padauk 700 30, lh 1.3) over "Counter & tables" (13/600
    #6e6358).
  - Then the Badge "Server" (accent tone).
  - Trailing: Help, a gold circle 44 (x1250–1294), and Lock 44 (x1302–1346). There is no approvals circle:
    the signed-in role is a server.
- **Zone strip y76–136,** main column x0–878. #faf9f5, 1px --bd bottom, padding 8 20; 44px pills, gap 8,
  Burmese only:
  - "အော်ဒါ ဖွင့်";
  - "စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ", LIT (`aria-current="location"`, the cap);
  - "ပါဆယ်ထုပ်များ".
- **Main column x20–858.** The Tables zone: its heading at y152, then the shipped floor cards in three columns.
  Table 7's card wears the shipped `aria-current` halo. No flags or pennants anywhere.
- **Pane x882–1346** (border-left 1px --bd, content x906–1338, sticky from y92). Table 7's detail, with
  Mohinga's row still showing its 44px pill "ဖျက် / အခမဲ့" (#fffdf8, 1px --bd, ink #a44b34, 13/700).

**③ SCRIM.** The full frame: rgba(15,10,5,0.3) + `backdrop-filter: blur(28px) saturate(0.85)`.

**④ THE SHEET x411–955, y64–960** (544×896, centred): radius 26, #fffdf8, shadow `0 24px 60px
rgba(35,24,16,0.16)`, padding 0 20 24. Content is x431–935 (504 wide). **No grab bar** (hidden at ≥48em).
In Both mode the content fits without scrolling.

- **HEAD y64–135** (sticky, #ffffff, `inset 0 1px 0 rgba(255,255,255,0.55)`, padding 8 20 8):
  - The title (`Dialog.Title`):
    - y76–111: "“မုန့်ဟင်းခါး” ဖျက်" (Padauk 700 22, lh 1.6, #1b1714);
    - y111–127: "Remove “Mohinga”" (Hanken 13/600 #6e6358).
  - Before a chip is lit, the title is the dish alone: "မုန့်ဟင်းခါး / Mohinga".
  - **✕** at x901–945, y70–114: a 44 target around a 32px #f2efe7 disc, X glyph 18 #1b1714.
- **SUMMARY y145–171** (a receipt row on one baseline):
  - "1×" (15/700 tabular #6e6358) + "Mohinga" (15/600 #1b1714);
  - 10px gap, a 14px flame glyph #6e6358, "ချက်နေဆဲ" (Padauk 700 13 #6e6358) + " · already cooking"
    (13/600 #6e6358);
  - a dotted leader (flex 1, 2px dotted rgba(58,35,23,0.25));
  - "$14.00" (Hanken 16/800 tabular #1b1714).
- **THE GRID y183–566**, columns 244 | 16 | 244: Remove x431–675, Make it free x691–935.
  - **Column heads y183–223** (40 tall), each a 28px kind mark + a stacked label:
    - Remove mark: a radius-8 square #f6e9e4 holding a centred 14×3 bar #a44b34 (radius 2). Label
      "ဖျက် (ပြန်နုတ်)" (Padauk 700 15) over "Remove (off the bill)" (13/600 #6e6358).
    - Make it free mark: a 28 circle #fbebd3 holding the `gift` glyph 16 (stroke 2, #8a5a00). Label
      "အခမဲ့ (ငွေမယူ)" over "Make it free (no charge)".
  - **Chips** (`.staff-chip.staff-chip-block`), each 48 tall, radius 12, #f2efe7, 1px --bd, padding 4 12 4 10,
    flex row, gap 8. Inside: **the column's kind mark at 18px** (Remove: a radius-5 square #f6e9e4 with a
    9×2.5 bar #a44b34; Free: an 18 circle #fbebd3 with `gift` 11 #8a5a00), then the label stacked:
    Burmese (Padauk 700 15) over English (13/600). Inside a control, the echo takes the control's ink:
    #1b1714 at rest. Text never shrinks; a wrapped Burmese line grows the chip.
    - **Left, from y231, gap 6:**
      - y231–279 "မှားပြီး မှာမိတာ / Ordered by mistake";
      - **y285–333 "မီးဖိုချောင်က မှားချက်မိတာ / Kitchen made it wrong" — LIT**: #a65f10, ink #fffdf8,
        border transparent, `inset 0 1px 0 rgba(255,255,255,0.55), 0 0 14px -6px rgba(232,168,60,0.34)`.
        The 18px mark keeps its own #f6e9e4 tile, so the kind still reads on the cap;
      - y339–387 "ကုန်သွားတာ / We ran out";
      - y393–441 "အရည်အသွေး / ဧည့်သည် မကျေနပ် / Quality / guest unhappy";
      - y447–495 "ဧည့်သည် စိတ်ပြောင်းသွားတာ / Guest changed their mind";
      - y501–549 "အခြား / Other".
    - **Right, from y231:**
      - y231–279 "ပြန်ဖြေရှင်းပေးတာ / Making it right";
      - y285–333 "အရည်အသွေး / ဧည့်သည် မကျေနပ် / Quality / guest unhappy";
      - y339–387 "ဧည့်သည်ကို ဂုဏ်ပြု / Guest courtesy";
      - y393–441 "အခြား / Other".
  - **THE CONSEQUENCE HINT, x691–935, y453–566** (the grid's empty right foot, reserved at all times so
    nothing jumps when it fills). Radius 12, 1px --bd, padding 10 12, on #fffdf8. It holds the lit kind's
    sentence:
    - "ပစ္စည်းကို ဖျက်ပြီး စာရင်းထဲက ထုတ်ပါမယ်။ မီးဖိုချောင်က မချက်တော့ပါ။" (Padauk 400 13, lh 1.6,
      #6e6358, two lines);
    - "Cancels the item and removes it from the bill. The kitchen won’t make it." (13, lh 1.4, #6e6358,
      three lines).

    Empty until a chip is lit.

- **THE SLIP x431–935, y578–766.** Radius 18, 1px --bd, background
  `linear-gradient(180deg, #f8f5ee, #fffdf8)`, `inset 0 1px 0 rgba(255,255,255,0.55)`, padding 14 16
  (inner x447–919). It is a `<fieldset>`.
  - y592–616, the legend (see THE ONE SLIP).
  - **y626–690, the names row:**
    - the asker token x447–592: a "T" disc, then "Thiri က တောင်းထား" over "from Thiri";
    - the arrow x600–620;
    - the tile group from x628: one tile x628–778, **"A · Aye", LIT**.
  - **y700–752, the PIN row:**
    - the label x447–567: "Aye ရဲ့ ပင်နံပါတ်" over "Aye, your PIN";
    - the field x579–919 (340×52), holding "••••".
- **PRIMARY y778–842** (x431–935): the `@mms/ui` Button primary xl block (64): gradient #a65f10 → #8f5009,
  ink #fffdf8, `inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px -1px rgba(166,95,16,0.42)`. Label stacked:
  "ခွင့်ပြုချက်နဲ့ ဖျက်" (Padauk 700 17) over "Remove with approval" (13/600, inherits #fffdf8).
- **SECONDARY y850–904:** Button secondary lg block (54): #fffdf8, 1px --bd, inset sheen + --sh, ink
  #1b1714. Label stacked: "မန်နေဂျာ မရှိဘူးလား? ခွင့်ပြုချက် တောင်းပါ" (Padauk 700 15) over
  "No manager here? Request approval" (13/600).
- **REGION y912–932:** `<p id="loss-msg" role="status">`, 13px #a44b34, min-height 20, empty.

### STATES (described, not drawn)

- **No chip lit:** the title is the dish and the hint is empty. The primary reads "Remove with approval" (the
  shipped default action), aria-disabled at .55. A tap says "Pick a reason to continue." (`table.loss.reasonRequired`)
  in the region; both groups get `aria-invalid` and a #a44b34 border.
- **A Make it free chip lit:**
  - title "“မုန့်ဟင်းခါး” အခမဲ့ / Make “Mohinga” free";
  - the hint says the comp sentence;
  - the primary reads "ခွင့်ပြုချက်နဲ့ အခမဲ့ပေး / Make free with approval".
- **Two or more eligible:** the tiles wrap (a second row of 64 under the first; the sheet body scrolls under
  its sticky head). None is lit, and the PIN label reads "ပင်နံပါတ် / PIN" until a tile is tapped. Never pre-lit
  when ambiguous: a pre-lit wrong name would spend someone else's lockout attempts.
- **Zero eligible**, two true variants (glanceable's sentences replace the false "none are signed in"). The
  tiles and PIN are replaced, inside the slip, by an inset (radius 12, #f6e9e4, 1px rgba(164,75,52,0.32),
  padding 12 14) holding a 20px flag glyph #a44b34 and:
  - (a) "ဒီမှာ Aye တစ်ယောက်ပဲ ခွင့်ပြုနိုင်တယ် — ကိုယ့်တောင်းဆိုချက်ကို ကိုယ်တိုင် ခွင့်မပြုရပါဘူး။ / Only Aye can
    approve here, and nobody approves their own request." (the asker is the only signer); or
  - (b) "No manager has a tablet PIN yet, so nobody can approve it here." (with its draft);
  - plus the tail "Send it to Open requests — it stays on the bill until a manager decides."

  The PRIMARY becomes "ဖျက်ဖို့ မန်နေဂျာ ခွင့်ပြုချက် တောင်းမယ် / Request a manager’s approval to remove it"
  (or the comp twin), and the secondary is not drawn.

- **Manager-signed tablet (the seam, `ASKER_BY_PIN` on):**
  - The asker token reads "Aye က တောင်းထား / from Aye" with the quiet 44px "Aye မဟုတ်ဘူးလား? ကိုယ့်နာမည်ကို
    နှိပ်ပါ / Not Aye? Tap your name".
  - Tapping it turns the token into a sub-group: "ဘယ်သူ တောင်းတာလဲ? / Who is asking?", tiles of every active
    person with a PIN (any role; the badge still says Server, ruling #18), and "ကိုယ့်နာမည်ကို နှိပ်ပြီး
    ကိုယ့်ပင်နံပါတ် ရိုက်ထည့်ပါ။ / Tap your name and enter your own PIN." over a second 52px field labelled
    "Thiri ရဲ့ ပင်နံပါတ် / Thiri, your PIN".
  - The approver tiles then recompute, and Aye appears. Both PINs ride the one write; the asker's id becomes
    `p_initiator`.
  - With the seam off, the signed-in account stays the asker, the picker hides them, and zero-eligible
    variant (a) shows.
- **Roster loading:** two 64px skeleton tiles + "ဖွင့်နေပါတယ်… / Loading…".
- **Roster failed:** "Couldn’t load the list of managers — that doesn’t mean none are here. Try again." with a
  44px Try again.
- **Busy:** the primary reads "လုပ်နေပါတယ်… / Working…" (`aria-busy`); the request reads "ပို့နေပါတယ်… /
  Sending…".
- **Refusals in the region** (all shipped keys): wrong PIN with tries left; the lockout countdown (the field
  goes read-only); too many PIN attempts; mid-payment; a request already open; the no-answer and
  couldn't-confirm lines, with Reload beside the region.
- **Not gated** (an unstarted line at $20 or under, Remove lit): no slip; the primary is "ပစ္စည်း ဖျက် / Remove
  item".
- **Requested:** the sheet closes; the line shows the shipped "ခွင့်ပြုချက် တောင်းထားပြီ".
- **Phone width:** the columns stack (Remove, then Make it free), and the hint moves under the lit column.
- **Night:** the same geometry with the .dark tokens; the lit cap is gold #e7a53a with ink #130d1e.

### COPY (English) — verbatim

- Remove “Mohinga” · Make “Mohinga” free · Mohinga
- 1× Mohinga · $14.00 · already cooking
- Remove (off the bill) · Make it free (no charge)
- Ordered by mistake · Kitchen made it wrong · We ran out · Quality / guest unhappy · Guest changed their
  mind · Other
- Making it right · Quality / guest unhappy · Guest courtesy · Other
- Cancels the item and removes it from the bill. The kitchen won’t make it.
- The guest isn’t charged, but the kitchen still makes it.
- Manager approval · from Thiri · Aye, your PIN · PIN
- Remove with approval · Make free with approval
- No manager here? Request approval
- Pick a reason to continue.
- Only Aye can approve here, and nobody approves their own request.
- No manager has a tablet PIN yet, so nobody can approve it here.
- Send it to Open requests — it stays on the bill until a manager decides.
- Request a manager’s approval to remove it · Request a manager’s approval to make it free
- Remove item · Make item free
- Not Aye? Tap your name · Who is asking? · Tap your name and enter your own PIN. · Thiri, your PIN
- Loading… · Couldn’t load the list of managers — that doesn’t mean none are here. Try again. · Try again
- Working… · Sending…
- Wrong PIN — {n} tries left. · Too many tries — try again in {x}. · Too many PIN attempts — wait a few
  minutes, then try again.
- A manager request is already open for this item.
- No answer yet — this change may still be recorded. Don’t do it again: reload the page to see whether it went
  through.
- **Accessible-only:** Remove this item or make it free (the grid's group name) · Close (the ✕)

### COPY (Burmese) — shipped strings or the briefs' drafts only

| String                                                                                               | Source                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “မုန့်ဟင်းခါး” ဖျက် · “မုန့်ဟင်းခါး” အခမဲ့                                                           | shipped `table.loss.title.void/.comp`, staff.ts:1286-1287                                                                                                 |
| ချက်နေဆဲ                                                                                             | shipped `table.loss.cooking`, staff.ts:1249                                                                                                               |
| ဖျက် (ပြန်နုတ်) · အခမဲ့ (ငွေမယူ)                                                                     | shipped `table.loss.seg.*`, staff.ts:1250-1251                                                                                                            |
| the ten reason labels                                                                                | shipped `table.loss.reason.*`, staff.ts:1263-1276                                                                                                         |
| ပစ္စည်းကို ဖျက်ပြီး စာရင်းထဲက ထုတ်ပါမယ်။ မီးဖိုချောင်က မချက်တော့ပါ။                                  | shipped `table.loss.hint.void`, staff.ts:1252-1255                                                                                                        |
| ဧည့်သည်ဆီက ငွေမယူပါ။ ဒါပေမဲ့ မီးဖိုချောင်က ဆက်ချက်ပါမယ်။                                             | shipped `table.loss.hint.comp`, staff.ts:1256-1259                                                                                                        |
| မန်နေဂျာ ခွင့်ပြုချက်                                                                                | shipped `table.loss.managerLegend`, staff.ts:1312                                                                                                         |
| Thiri က တောင်းထား                                                                                    | shipped `table.appr.from`, staff.ts:515                                                                                                                   |
| Aye ရဲ့ ပင်နံပါတ်                                                                                    | DRAFT, brief-m8.md:276 (guided)                                                                                                                           |
| ပင်နံပါတ်                                                                                            | shipped `pin.label`, staff.ts:2371                                                                                                                        |
| ခွင့်ပြုချက်နဲ့ ဖျက် · ခွင့်ပြုချက်နဲ့ အခမဲ့ပေး                                                      | shipped `table.loss.confirmApproval.*`, staff.ts:1327-1331                                                                                                |
| မန်နေဂျာ မရှိဘူးလား? ခွင့်ပြုချက် တောင်းပါ                                                           | shipped `table.loss.noManager`, staff.ts:1332-1335                                                                                                        |
| ဆက်သွားဖို့ အကြောင်းအရင်း ရွေးပါ။                                                                    | shipped `table.loss.reasonRequired`, staff.ts:1277-1280                                                                                                   |
| ဒီမှာ {x} တစ်ယောက်ပဲ ခွင့်ပြုနိုင်တယ် — ကိုယ့်တောင်းဆိုချက်ကို ကိုယ်တိုင် ခွင့်မပြုရပါဘူး။           | DRAFT, brief-m8.md:446 (glanceable)                                                                                                                       |
| မန်နေဂျာ ဘယ်သူမှ တက်ဘလက် ပင်နံပါတ် မသတ်မှတ်ရသေးလို့ ဒီမှာ ဘယ်သူမှ ခွင့်မပြုနိုင်သေးပါဘူး။            | DRAFT, brief-m8.md:447 (glanceable)                                                                                                                       |
| ဖွင့်ထားတဲ့ တောင်းဆိုချက်များဆီ ပို့လိုက်ပါ — မန်နေဂျာ ဆုံးဖြတ်တဲ့အထိ စာရင်းထဲမှာ ရှိနေပါမယ်။        | DRAFT K15-HIGH, brief-m8.md:448 (glanceable)                                                                                                              |
| ဖျက်ဖို့ မန်နေဂျာ ခွင့်ပြုချက် တောင်းမယ် · အခမဲ့ပေးဖို့ မန်နေဂျာ ခွင့်ပြုချက် တောင်းမယ်              | shipped `table.loss.requestApproval.*`, staff.ts:1317-1324                                                                                                |
| ပစ္စည်း ဖျက် · ပစ္စည်း အခမဲ့ပေး                                                                      | shipped `table.loss.confirm.*`, staff.ts:1325-1326                                                                                                        |
| {x} မဟုတ်ဘူးလား? ကိုယ့်နာမည်ကို နှိပ်ပါ                                                              | DRAFT, brief-m8.md:440 (glanceable)                                                                                                                       |
| ဘယ်သူ တောင်းတာလဲ? · ကိုယ့်နာမည်ကို နှိပ်ပြီး ကိုယ့်ပင်နံပါတ် ရိုက်ထည့်ပါ။                            | DRAFT, brief-m8.md:281-282 (guided)                                                                                                                       |
| ဖွင့်နေပါတယ်… · မန်နေဂျာ စာရင်းကို မဖွင့်နိုင်ပါ — မန်နေဂျာ မရှိလို့ မဟုတ်ပါ။ ထပ်စမ်းပါ။ · ထပ်စမ်းပါ | shipped `pin.manager.loading`, `pin.manager.loadFailed`, `out.shell.retry` (staff.ts:2424, :2437-2440, :143)                                              |
| လုပ်နေပါတယ်… · ပို့နေပါတယ်…                                                                          | shipped `table.loss.working/.sending`, staff.ts:1313-1314                                                                                                 |
| pin wrong / locked / rate-limited lines                                                              | shipped `pin.wrong.many`, `pin.lockedFor`, `pin.rateLimited`, staff.ts:2376, :2387, :2415                                                                 |
| ဒီပစ္စည်းအတွက် မန်နေဂျာ တောင်းဆိုချက် ဖွင့်ထားပြီးသား။ · the waiting line                            | shipped `table.loss.msg.alreadyPending`, `table.loss.msg.waiting`, staff.ts:1300, :3764                                                                   |
| ဒီပစ္စည်းကို ဖျက် ဒါမှမဟုတ် အခမဲ့ပေး (accessible only)                                               | shipped `table.loss.a11y.action`, staff.ts:1240-1243                                                                                                      |
| the bar, the strip and the pane behind the scrim                                                     | shipped `floor.door.counter`, `floor.zone.start`, `floor.tables.title`, `expo.title`, `table.line.verb.voidComp` (staff.ts:977, :370, :1011, :851, :1218) |

The title's `{x}` takes each tongue's own dish name (Burmese from `TableLineView.nameMy`, English
`line.name`). That needs one per-tongue vars seam on `<Chrome>`; the strings are unchanged.

### A11Y

- **Dialog.** The shared Sheet is `role="dialog"`, `aria-modal`, named by its title. Initial focus goes to the
  sheet container, which announces the dialog. Esc, the scrim and ✕ close it (refused while busy, §16), and
  focus returns to the line's "ဖျက် / အခမဲ့" pill.
- **The grid** is a `role="group"` named "Remove this item or make it free" (sr-only, shipped). Inside it sit
  two `role="group"`s, each `aria-labelledby` its column head. Every chip is an `aria-pressed` button, so
  each "Quality / guest unhappy" is announced inside its own action's group. Once lit, both groups are
  `aria-describedby` the hint. Kind marks are `aria-hidden`; the column head carries the word.
- **The slip** is a `<fieldset>` with its `<legend>`.
  - The asker token is text. The arrow is `aria-hidden`.
  - The tiles are an `aria-pressed` group named by the legend.
  - The PIN `<input>` is named by its own `<label>` ("Aye, your PIN"), so two PIN fields (the seam) never
    share a name.
- **Primary.** `type="submit"`; `aria-disabled` (never native) until a chip, a lit name and 4–8 digits are in.
  The tap still answers, in the region, naming what is missing. Busy is `aria-busy` plus a stated word.
  Enter in the PIN field submits this ONE PIN verb (the request uses no PIN), which is allowed here because
  only one verb shares the field.
- **ONE live region:** `#loss-msg` (`role="status"`). The lockout countdown outranks a message. The hint, the
  zero-eligible inset and the slip are plain text.
- **Focus moves:**
  - A chip tap on a gated line scrolls the slip into view (`auto` under reduced motion) and focuses the PIN
    field when one name is lit, or else the first tile.
  - A tile tap → the PIN field.
  - A wrong PIN → that field, emptied.
  - "Not Aye?" → the asker sub-group's first tile.
- **Targets:** chips 48, tiles 64, PIN 52, primary 64, secondary 54, ✕ 44, "Not Aye?" 44.
- **Reduced motion:** the hint's `mms-rise` and the cap's ignite are off; the scroll is `auto`.
- **Language:** every Burmese run is `lang="my"` (Padauk 400/700, lh 1.6, ≥13px, `font-synthesis: none`).
  Names are verbatim, marked `lang="en"` when Latin. Money digits are Latin and tabular.

---

## SCREEN picked-m8-2.dc.html — The manager deciding: their name already picked, PIN, and the key that is the decision

**Device:** tablet 1366×1024 landscape. **Theme:** light. **Language mode:** Both. **Route:** `/staff`
(the counter), scrolled to zone 4, "Open requests". **Signed in as:** Aye (Manager).

**The state drawn.** Two requests wait. Aye tapped **Decide** on the oldest, Table 7's Mohinga, and the card
opened across both columns. Aye's tile arrived lit, because Aye is the one eligible signer (an active
manager with a PIN who is not Thiri). Four digits are typed and the keyboard is dismissed. The next tap,
**Approve**, IS the decision. No pane table is selected.

### LAYOUT (frame coordinates, top to bottom)

**① Ground.** #faf9f5 with the staff paper rules.

**② StaffBar y0–76** (as screen 1, with these changes):

- The Badge reads "Manager" (jade tone).
- **The approvals circle** x1198–1242, y16–60: the shipped `.staff-circ` (#fffdf8, 1px --bd, inset sheen),
  `check` glyph 20 #1b1714. Its count badge "၂" sits at the top-right, −4/−4: 18 tall, min-width 18, radius
  999, #a65f10, ink #fffdf8, 11/800. The count is now live, from the board's 5 s snapshot.
- Help x1250–1294 and Lock x1302–1346.

**③ Zone strip y76–136** (x0–878, sticky, Burmese only), six 44px pills, gap 8:

- "အော်ဒါ ဖွင့်";
- "စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ";
- "ပါဆယ်ထုပ်များ";
- **"ဖွင့်ထားတဲ့ တောင်းဆိုချက်များ" + count pip "၂", LIT** (`aria-current="location"`). The pip is 20 tall,
  radius 999, padding 0 6, 11/800, after a 6px gap. Inside the lit chip it inverts to #fffdf8 with
  #8f5009 ink (6.22:1); on an unlit chip it is #a65f10 with #fffdf8 ink;
- "ဒီနေ့ ရငွေ";
- "ဒီနေ့ ငွေရှင်းတာနဲ့ ပြန်အမ်းတာများ" (clipped at x878; the strip scrolls).

**④ MAIN COLUMN x20–858.**

- **Zone head y152–188:**
  - `h2#appr-h.staff-zone-head` "ဖွင့်ထားတဲ့ တောင်းဆိုချက်များ" (Fraunces/Padauk 17/700, #1b1714) at x20,
    Burmese only (shipped, `echo={false}`);
  - on the right, the plain count line "စောင့်နေတာ ၂ ခု" (13, #6e6358, `lang="my"`, not live).
- **The grid** from y204: `role="list"` (StaggerList), two columns of 413, gap 12.

**⑤ OPEN CARD A — x20–858, y204–556** (838×352, `grid-column: 1 / -1`).

- `<article>`, radius 20, #fffdf8, with the dot texture: `radial-gradient(rgba(166,95,16,0.16) 1px, transparent
1.6px)` on an 18px grid, masked by `radial-gradient(130% 110% at 50% 0%, #000 40%, transparent 82%)`.
- **The "you are here" form** (the shipped `.floor-card[aria-current]` recipe, globals.css:14837-14844), never
  the selection cap: border 1px rgba(228,163,58,0.6); shadow `inset 0 1px 0 rgba(255,255,255,0.55),
0 1px 3px -1px rgba(35,24,16,0.07), 0 14px 28px -18px rgba(35,24,16,0.28), 0 0 18px -8px
rgba(232,168,60,0.34)`.
- Overflow hidden; a grid of 419 | 419.

LEFT HALF x20–439 (the ticket):

- **STRIP y204–264**, #f2efe7, padding 8 16.
  - Left: the table link (SplitAwareLink → the pane), min-height 44: "စားပွဲ" (Padauk 700 22) + " 7" (Fraunces
    32/700, tabular, lh 1.08) in #1b1714, then a `chevron` 16 #726859. A 2px underline at offset 4 on hover
    and focus.
  - Right: the **flag** glyph 16 (stroke 2, #a44b34), then the age stacked: "၆ မိနစ်က" (Padauk 700 17
    #1b1714) over "6m ago" (13/600 #6e6358). It is a `<time dateTime>`, never coloured.
- **BODY**, padding 12 16 16, gap 8:
  - **Row A y276–308:** the Remove mark 28 (radius 8, #f6e9e4, a 14×3 bar #a44b34), "ဖျက်" (Padauk 700 13
    #a44b34) + " · REMOVE" (13/800, uppercase, tracking 0.05em, #a44b34). Right-aligned: **"$14.00"**
    (Hanken 32/800 tabular #1b1714, lh 1).
  - **Row B y316–379:** "1× " (Hanken 22/800 tabular) + "မုန့်ဟင်းခါး" (Padauk 700 26, lh 1.6) over "Mohinga"
    (17/800). Bottom-right: a `flame` 16 #a44b34, "ချက်ပြီးသား" (Padauk 700 13 #a44b34) + " · COOKED"
    (13/800 uppercase #a44b34).
  - **Row C y387–428:** the reason, "မီးဖိုချောင်က မှားချက်မိတာ" (Padauk 400 15 #6e6358) over "Kitchen made it
    wrong" (13 #6e6358). On a COLLAPSED card this row also carries " · Thiri က တောင်းထား / · from Thiri";
    opened, the asker moves into the slip.

RIGHT HALF x439–858 (the decision): border-left 1px --bd, padding 16 20, content x459–838 (379 wide).

- **y220–244**, the legend (THE ONE SLIP).
- **y256–320, the names row:**
  - the asker token x459–604: "T", "Thiri က တောင်းထား" over "from Thiri";
  - the arrow x612–632;
  - the tile group: **"A · Aye" x640–790, LIT**.
- **y332–384, the PIN row:**
  - the label x459–569: "Aye ရဲ့ ပင်နံပါတ်" over "Aye, your PIN";
  - the field x581–838 (257×52), holding "••••".
- **y400–464, THE DECISION KEYS** (each is also the submit):
  - **Deny x459–642 (183×64):** a paper pill (#fffdf8, 1px --bd, `inset 0 1px 0 rgba(255,255,255,0.55),
0 1px 3px rgba(35,24,16,0.06)`): an ✕ glyph 20 (stroke 2, #6e6358), then "ငြင်းပယ်" (Padauk 700 17) over
    "Deny" (13/600), ink #1b1714. Deny keeps money, so it wears no warn ink.
  - **Approve x654–838 (184×64):** the primary gradient: a ✓ glyph 20 (stroke 2.2, #fffdf8), then "ခွင့်ပြု"
    (Padauk 700 17) over "Approve" (13/600).
- **y472–516:** "မလုပ်တော့ · Cancel", quiet (transparent, #6e6358, 14/700), 44 tall, right-aligned.
- **y520–540:** the card's `<p role="status">` (13, #a44b34, min-height 20), empty. It exists only while this
  decision is open.

**⑥ COLLAPSED CARD B — x20–433, y568–874.**

- `.card.card-textured`, radius 20, 1px --bd, the shipped card shadow.
- **STRIP y568–628:** "စားပွဲ 3" + chevron; on the right the flag 16 + "၂ မိနစ်က" over "2m ago".
- **Row A y640–672:** the gift disc 28 (#fbebd3, `gift` 16 #8a5a00), "အခမဲ့" (Padauk 700 13 #8a5a00) +
  " · MAKE IT FREE" (13/800 uppercase #8a5a00), with "$13.00" (32/800) on the right.
- **Row B y680–743:** "1× ရှမ်းခေါက်ဆွဲ" (26) over "Shan Noodles" (17/800); bottom-right the flame +
  "ချက်ပြီးသား · COOKED".
- **Row C y751–792:** "ဧည့်သည်ကို ဂုဏ်ပြု · Thiri က တောင်းထား" (Padauk 15 #6e6358) over "Guest courtesy ·
  from Thiri" (13 #6e6358).
- **Row D y804–858: "Decide"**, the Button secondary lg block (54): #fffdf8, 1px --bd, "ဆုံးဖြတ်မယ်" (Padauk
  700 15) over "Decide" (13/600), then an arrow-right glyph 18. The open card's Approve is the screen's one
  primary.

**⑦ PANE x882–1346** (sticky from y92, border-left 1px --bd): no table is selected. The shipped empty state is
centred around y180–330: the `receipt` glyph 24 #726859, the h2 "စားပွဲတစ်ခု ရွေးပါ" (Fraunces/Padauk 17/700),
and "အဲဒီစားပွဲရဲ့ အော်ဒါက စာရင်းဘေး ဒီနေရာမှာ ပေါ်လာပါမယ်။" over "Its order opens here, beside the list."
(13 #6e6358).

### STATES (described, not drawn)

- **After Approve (ok) — the one moment of delight.** The card is replaced in place by a **receipt row**
  (838×88, `.card`, padding 12 20), and focus moves to it (`tabIndex -1`):
  - **the verdict mark, 32:**
    - a ✓ disc (#346e47 fill, #fffdf8 check) for an approved Remove;
    - the gift disc (#fbebd3, `gift` #8a5a00) for an approved Make it free;
    - an ✕ in a 2px #6e6358 outlined radius-8 square for Deny;
  - **the headline** (Padauk 700 17 over 13/600 #6e6358), in the same words the asker's line will show:
    - "ဖျက်ပြီး · Aye ခွင့်ပြုထား / Removed · Aye approved";
    - or "အခမဲ့ ပေးထား · Aye ခွင့်ပြုထား / On the house · no charge · Aye approved";
    - or "စာရင်းထဲ ဆက်ထား · Aye က ငြင်းလိုက်တယ် / Kept on the bill · Aye said no";
  - **beneath it** (13, #6e6358): "မုန့်ဟင်းခါး · စားပွဲ 7 · Thiri က တောင်းထား / Mohinga · Table 7 · from Thiri";
  - **"ရပြီ · Got it"**, quiet, 44, on the right.

  The mark rises 8px (`mms-rise`; static under reduced motion). The card's region says the sentence once:
  "Approved — Mohinga is off Table 7’s bill." / "Approved — Mohinga is free on Table 7." / "Denied — Mohinga
  stays on Table 7’s bill." The row stays until "Got it" or the page is left; there is no timer. Amounts are
  never printed (M184, and the bill drops by $15.47, not $14.00).

- **Enter in the PIN field:** nothing is sent; the region says "Choose Approve or Deny."
- **Busy:** the pressed key shows "လုပ်နေပါတယ်… / Working…" (`aria-busy`); both keys and Cancel are
  aria-disabled.
- **Two or more eligible:** none lit, the label reads "PIN", and the tiles wrap in the right half.
- **Zero eligible** (the only signer asked): the names row keeps the asker token; the tiles, PIN and keys are
  replaced by the #f6e9e4 inset with a flag and "Only Aye can approve here, and nobody approves their own
  request." Cancel stays live.
- **The table already PAID** (`cartOpen` false). The strip shows "ငွေရှင်းပြီး / Paid" (13/700 #346e47) in place
  of the age. Opened, the right half shows:
  - an inset (radius 12, #f2efe7, padding 10 12): "ဒါ စောင့်နေတုန်း စားပွဲ 7 ငွေရှင်းသွားပြီ — မုန့်ဟင်းခါး အတွက်
    $14.00 ယူပြီးပါပြီ။ / Table 7 paid while this was waiting — Mohinga was charged $14.00.";
  - a quiet 44px link "ဒီနေ့ ငွေရှင်းတာနဲ့ ပြန်အမ်းတာများ → / Today’s payments & refunds →" (`#settled-h`; the
    line refund there carries its own PIN and logs the name);
  - the slip;
  - ONE paper key, 64, full width: **"ပိတ်မယ် / Close it"**, which runs the existing deny path. No Approve key
    is drawn, so "no longer open — deny it" can no longer be reached.

  On ok, the card leaves with no receipt row (nothing was decided about food) and focus goes to the next
  Decide.

- **Changed after asking** (M184 refuses `changed`): under the ticket, a #f6e9e4 band (radius 12, padding 8 12,
  13/700 #a44b34): "{x} တောင်းပြီးမှ ပြောင်းသွားတယ် — အခု ၂ ခု · $28.00။ ဘာမှ မနုတ်ရသေးပါ၊ {x} ထပ်တောင်းနိုင်ပါတယ်။ /
  Changed after Thiri asked — now 2× · $28.00. Nothing was taken off; Thiri can ask again." The only key is
  "Close it".
- **Shipped refusals in the region:**
  - "That table is mid-payment — try again once they’ve finished.";
  - "Already resolved — refreshing.";
  - "That item has since changed — refreshing.";
  - the outage line;
  - "No answer yet — your decision may still be recorded…" with Reload beside the region;
  - the PIN lines.
- **Queue frozen:**
  - the count line becomes the shipped `frozenBoardCopy` sentence in #a44b34;
  - the bar circle's border turns **dashed** (1.5px, a shape change, not colour alone), and its sr-only name
    gains the same as-of sentence;
  - an unreadable count shows a dashed circle with no number and the sr-only "ခွင့်ပြုချက်များ — မစစ်နိုင်ပါ /
    Approvals — couldn’t check", never a false 0.
- **Nothing waiting:** the shipped empty state "ခွင့်ပြုစရာ ဘာမှ မရှိပါ / Nothing to approve", no badge, no
  pip.
- **Night:** the same geometry; the lit tile and Approve are gold #e7a53a with ink #130d1e; the ✓ disc is
  #5fb07e.

### COPY (English) — verbatim

- Open requests (not drawn in Both; the heading is Burmese only) · 2 waiting (likewise)
- Table 7 · Table 3 · 6m ago · 2m ago
- Remove · Make it free · cooked
- Kitchen made it wrong · Guest courtesy · from Thiri
- Mohinga · Shan Noodles · $14.00 · $13.00
- Manager approval · Aye, your PIN · PIN
- Deny · Approve · Cancel · Decide
- Working… · Choose Approve or Deny.
- Removed · Aye approved · On the house · no charge · Aye approved · Kept on the bill · Aye said no
- Mohinga · Table 7 · from Thiri · Got it
- Approved — Mohinga is off Table 7’s bill. · Approved — Mohinga is free on Table 7. · Denied — Mohinga stays on
  Table 7’s bill.
- Only Aye can approve here, and nobody approves their own request.
- Paid · Table 7 paid while this was waiting — Mohinga was charged $14.00. · Today’s payments & refunds → ·
  Close it
- Changed after Thiri asked — now 2× · $28.00. Nothing was taken off; Thiri can ask again.
- That table is mid-payment — try again once they’ve finished. · Already resolved — refreshing. · That item has
  since changed — refreshing.
- No answer yet — your decision may still be recorded. Don’t decide again: reload the page to see.
- Pick a table · Its order opens here, beside the list.
- Nothing to approve
- **Accessible-only:**
  - Approvals (2) · Approvals — couldn’t check;
  - Remove request for Mohinga · Free-item request for Shan Noodles (the card names);
  - Pending approval requests (the list name);
  - the keys' composed names (verb + dish, `al()`).

### COPY (Burmese) — shipped strings or the briefs' drafts only

| String                                                                                                    | Source                                                                        |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| ကောင်တာနဲ့ စားပွဲများ · the six zone chips                                                                | shipped staff.ts:977, :370, :1011, :851, :470, :1652, :1052                   |
| ဖွင့်ထားတဲ့ တောင်းဆိုချက်များ · စောင့်နေတာ {n} ခု                                                         | shipped `table.appr.open/.waiting`, staff.ts:470, :472                        |
| ခွင့်ပြုချက်များ ({n}) · ခွင့်ပြုချက်များ (sr-only)                                                       | shipped `floor.nav.approvalsCount/.approvals`, staff.ts:960-961               |
| စားပွဲ {id}                                                                                               | shipped `floor.table`, staff.ts:402                                           |
| {n} မိနစ်က                                                                                                | shipped `time.minAgo`, staff.ts:717                                           |
| ဖျက် · အခမဲ့ · ချက်ပြီးသား                                                                                | shipped `table.appr.kind.*`, `table.appr.cooked`, staff.ts:494-495, :504      |
| reason words · {x} က တောင်းထား                                                                            | shipped `table.loss.reason.*`, `table.appr.from`, staff.ts:1263-1276, :515    |
| မန်နေဂျာ ခွင့်ပြုချက် · ပင်နံပါတ်                                                                         | shipped staff.ts:1312, :2371                                                  |
| {name} ရဲ့ ပင်နံပါတ်                                                                                      | DRAFT, brief-m8.md:276 (guided)                                               |
| ငြင်းပယ် · ခွင့်ပြု · မလုပ်တော့ · လုပ်နေပါတယ်…                                                            | shipped `table.appr.verb.*`, `table.appr.working`, staff.ts:518-519, :537-538 |
| ဆုံးဖြတ်မယ်                                                                                               | DRAFT, m8.json → concepts[2].screens[0].copy_my (glanceable)                  |
| ခွင့်ပြု ဒါမှမဟုတ် ငြင်းပယ် တစ်ခု ရွေးပါ။                                                                 | DRAFT, brief-m8.md:531 (glanceable)                                           |
| ဖျက်ပြီး · {x} ခွင့်ပြုထား                                                                                | DRAFT, m8.json → concepts[2].screens[3].copy_my (glanceable)                  |
| အခမဲ့ ပေးထား + · {x} ခွင့်ပြုထား                                                                          | shipped `table.line.comped` (staff.ts:1211) + the same draft                  |
| စာရင်းထဲ ဆက်ထား · {x} က ငြင်းလိုက်တယ်                                                                     | DRAFT K15-HIGH, m8.json → concepts[2].screens[3].copy_my                      |
| ခွင့်ပြုပြီး — {x} ကို {t} ရဲ့ စာရင်းထဲက ထုတ်လိုက်ပြီ။ · …အခမဲ့ ပေးလိုက်ပြီ။ · ငြင်းပယ်ပြီး — …ဆက်ရှိမယ်။ | DRAFT K15-HIGH, brief-m8.md:532-534 (glanceable)                              |
| ရပြီ                                                                                                      | shipped `help.done`, staff.ts:2619                                            |
| ဒီမှာ {x} တစ်ယောက်ပဲ ခွင့်ပြုနိုင်တယ် — …                                                                 | DRAFT, brief-m8.md:537 (glanceable)                                           |
| ငွေရှင်းပြီး                                                                                              | shipped `floor.status.paid`, staff.ts:394                                     |
| ဒါ စောင့်နေတုန်း စားပွဲ {N} ငွေရှင်းသွားပြီ — {dish} အတွက် {m} ယူပြီးပါပြီ။                               | DRAFT, brief-m8.md:319 (guided)                                               |
| ဒီနေ့ ငွေရှင်းတာနဲ့ ပြန်အမ်းတာများ                                                                        | shipped `floor.settled.head`, staff.ts:1052-1055                              |
| ပိတ်မယ်                                                                                                   | DRAFT, brief-m8.md:318 (guided)                                               |
| {x} တောင်းပြီးမှ ပြောင်းသွားတယ် — အခု {qty} ခု · {m}။ …                                                   | DRAFT, brief-m8.md:317 (guided)                                               |
| the region's refusals                                                                                     | shipped `table.appr.msg.*`, staff.ts:540-563, :3867-3874                      |
| ခွင့်ပြုချက်များ — မစစ်နိုင်ပါ                                                                            | DRAFT, m8.json → concepts[1].screens[3].copy_my (guided)                      |
| ခွင့်ပြုစရာ ဘာမှ မရှိပါ                                                                                   | shipped `table.appr.empty`, staff.ts:477                                      |
| စားပွဲတစ်ခု ရွေးပါ · အဲဒီစားပွဲရဲ့ အော်ဒါက …                                                              | shipped `floor.pane.empty.*`, staff.ts:3329-3333                              |
| card / list names                                                                                         | shipped `table.appr.card.*`, `table.appr.a11y.queue`, staff.ts:499-503, :473  |

### A11Y

- **Zone.** `<section aria-labelledby="appr-h">`, focused by the bar circle's and the strip's fragment
  (`useZoneFocus`). The list is `role="list"`, named "Pending approval requests". Each card is an
  `<article>` named "Remove request for Mohinga".
- **The table link** is a real `<a>` with a 44px hit area; its chevron is `aria-hidden`. The flag glyph is
  `aria-hidden`; the age is `<time dateTime>`.
- **The decision** is a `<form tabIndex=-1>` named by the legend.
  - Its keys are `type="button"`, named by `al()` as the visible verb plus the dish (WCAG 2.5.3 containment
    holds).
  - Enter submits the form, which refuses and says "Choose Approve or Deny.": two verbs share the field.
  - Cancel is a button; it is aria-disabled while a decision is out.
- **ONE live region per card**, existing only while its decision is open (A4·2). The floor's region stays the
  screen's one state region. The count line, the pip and the badge are plain text, never live.
- **Focus moves:**
  - Decide → the PIN field (one eligible, already lit) or else the first tile; the opening card spans the
    grid by a FLIP (240ms; instant under reduced motion).
  - A tile → the PIN.
  - A wrong PIN → the field, emptied.
  - ok → the receipt row.
  - "Got it" → the next card's Decide, or the zone heading.
  - Cancel → the Decide that opened it.
  - A card that leaves under focus → the zone heading (the shipped catch-all, ApprovalsBoard.tsx:286-299).
- **The keyboard on an iPad:** the open card scrolls so its keys sit above the on-screen keyboard
  (visualViewport), never under it.
- **Never colour alone:** pending = flag + age + word; Remove = minus-square + "ဖျက်"; Free = gift disc +
  "အခမဲ့"; verdicts = ✓ / gift / ✕ square + words; frozen = a dashed border + a sentence.
- **Targets:** keys 64, tiles 64, PIN 52, Decide 54, link / Cancel / Got it 44, circle 44, chips 44.
- **Reduced motion:** the FLIP, the receipt's `mms-rise`, the count's `mms-pop` and every smooth scroll are
  off. Nothing pulses at any setting.

---

## SCREEN picked-m8-3.dc.html — Take payment with a flag still up: decide it here, or take payment anyway

**Device:** tablet 1366×1024 landscape. **Theme:** light. **Language mode:** Both. **Route:** `/staff`
(the counter) with Table 7's pane open, scrolled to its end. **Signed in as:** Thiri (Server).

**The state drawn.** Table 7's guest asked to pay at the counter 2 minutes ago (their phone shows only "Pay at
the counter", owner answer 2). Mohinga's request is still open. Above the cash trigger, the pane shows a
paper card that names the dish and the consequence. Its hero is **"Decide it here"**; beside it, **"Take
payment anyway"**. The cash trigger is dimmed until one of the two is used. Nothing is blocked.

### LAYOUT (frame coordinates, top to bottom)

**① Ground.** #faf9f5 with the staff paper rules.

**② StaffBar y0–76:** as screen 1 (Badge "Server", no approvals circle; Help and Lock).

**③ Zone strip y76–136** (x0–878, Burmese only): "အော်ဒါ ဖွင့်" · **"စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ" (LIT)** ·
"ပါဆယ်ထုပ်များ".

**④ MAIN COLUMN x20–858** (the Tables zone, unchanged by this design; no flag marks):

- **y152–188**, the zone heading "စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ".
- **y204–514**, the shipped floor cards: three columns of 270, gap 14, two rows of 148.
  - Each card shows its label ("စားပွဲ 2" … with the numeral), its status word (`floor.status.*`) and
    "ယခုအထိ $x · ပစ္စည်း n ခု".
  - The cards: Table 2 · Table 3 · Table 5 / **Table 7** · Table 9 · Counter order.
  - **Table 7** wears the shipped `aria-current` halo (border rgba(228,163,58,0.6), the gold glow) with its
    label in the lit cap. Its status reads "ကောင်တာမှာ ရှင်းမယ် / Pay at counter" and its sum "ယခုအထိ $68.00 ·
    ပစ္စည်း ၇ ခု".
- **y530**, the "ပါဆယ်ထုပ်များ" zone heading begins.

**⑤ PANE x882–1346** (sticky y92–1008, border-left 1px --bd, padding-left 24; content x906–1338, 432 wide),
scrolled to its end:

- **y92–140, Parata row** (`border-top` 1px --bd, padding 8 0, 13px row):
  - "1× ပလာတာ" (Padauk 700 15) + "Parata (2 pcs)" (13 #6e6358) + " · ထုတ်ပြီး" (13 #726859);
  - right: "$5.00" (15/700 tabular) and the 44px pill "ဖျက် / အခမဲ့".
- **y140–192, Mee-Shay row:** "1× မြှီးရှည် · Mee-Shay · ချက်နေဆဲ", "$14.00", the pill.
- **y192–244, Mohinga row:** "1× မုန့်ဟင်းခါး · Mohinga · ချက်နေဆဲ", "$14.00" (never struck while pending),
  then the shipped quiet badge "ခွင့်ပြုချက် တောင်းထားပြီ" (13/700 #6e6358). There is no pill and no pennant.
- **y252–280, the subtotal row:** "$68.00" (15/700 tabular) + " ယခုအထိ စုစုပေါင်း · subtotal so far · ပစ္စည်း ၇ ခု"
  (13 #6e6358).
- **y296–372, the shipped ask card** (`.card.card-textured`, radius 20, padding 12 16):
  - the `receipt` glyph 16 #8f5009, then "ကောင်တာမှာ ငွေရှင်းချင်ပါတယ်" (Padauk 700 15) over "They’d like to
    pay here at the counter" (13/600 #6e6358);
  - beneath: "တောင်းဆိုတာ ၂ မိနစ်က" (13 #6e6358).
- **y388–416:** `h2#settle-h` "ငွေရှင်း" (13/700 #6e6358, Burmese only, as shipped).
- **y428–803, THE FLAG CARD** (x906–1338). A `<section>` `.card`: radius 20, #fffdf8, 1px --bd,
  `0 1px 0 rgba(255,255,255,0.55) inset, 0 1px 2px rgba(35,24,16,0.06), 0 8px 24px -12px rgba(35,24,16,0.18)`.
  No texture, no rail, no warn fill. Padding 16 20; content x926–1318 (392).
  - **y444–515, the title row:**
    - a 40×40 square (radius 12, #f6e9e4) holding the **flag** glyph 20 (stroke 2, #a44b34), x926–966;
    - the title at x978–1318 (`id="flag-title"`): "မုန့်ဟင်းခါး — မန်နေဂျာ ဆုံးဖြတ်ချက် စောင့်နေတယ်" (Padauk 700
      17, lh 1.6, #1b1714, up to two lines) over "Mohinga is waiting for a manager" (13/600 #6e6358).
  - **y527–589, the ticket line** (a 1px dotted rgba(58,35,23,0.16) rule above it):
    - the Remove mark 20 (radius 6, #f6e9e4, a 10×2.5 bar #a44b34), "ဖျက်" (Padauk 700 13 #a44b34),
      "1× Mohinga" (15/600 #1b1714), a dotted leader, "$14.00" (15/800 tabular);
    - beneath: "ချက်ပြီးသား · Thiri က တောင်းထား · ၆ မိနစ်က" (Padauk 13 #726859) over "cooked · from Thiri ·
      6m ago" (13 #726859).
  - **y605–659, THE PAIR** (side by side, gap 12, each 190×54):
    - **"Decide it here", x926–1116** (the card's hero): Button primary lg, the gradient, ink #fffdf8.
      "ဒီမှာ ဆုံးဖြတ်မယ်" (Padauk 700 15) over "Decide it here" (13/600). `aria-expanded="false"`.
    - **"Take payment anyway", x1128–1318:** Button secondary lg (#fffdf8, 1px --bd, inset sheen + --sh, ink
      #1b1714). "ဒီအတိုင်း ငွေရှင်းမယ်" (Padauk 700 15) over "Take payment anyway" (13/600).
  - **y669–787, THE CONSEQUENCE** (`id="flag-consequence"`, the anyway button's description):
    - "မုန့်ဟင်းခါး ကို လက်ရှိအတိုင်း ငွေယူပါမယ်။ တောင်းဆိုချက် ဖွင့်ထားဆဲ — နောက်မှ မန်နေဂျာ ခွင့်ပြုရင် “ဒီနေ့
      ငွေရှင်းတာနဲ့ ပြန်အမ်းတာများ” ကနေ ပြန်အမ်းပါ။" (Padauk 400 13, lh 1.6, #6e6358, three lines);
    - "Mohinga is charged as it is. The request stays open; if a manager approves it later, refund it from
      Today’s payments & refunds." (13, lh 1.4, #6e6358).
- **y819–883, THE CASH TRIGGER** (x906–1338), the shipped Button primary xl block (64), **aria-disabled**:
  opacity .55, no shadow (primitives.css:50-54). "ငွေသားနဲ့ ရှင်း · $75.14" (Padauk 700 17, figure Latin
  tabular) over "Take cash · $75.14" (13/600). `aria-describedby="flag-title settle-hint"`.
- **y891–950:** `#settle-hint` "ရောင်းခွန် ပါဝင်ပါတယ်။ ငွေသား အပိုကြေးကို နောက်တစ်ဆင့်မှာ ထည့်ပါ။" over
  "Includes sales tax. Add a cash tip in the next step." (13 #6e6358).
- **y950–1008:** the pane's dock reserve (empty).

### STATES (described, not drawn)

- **A tap on the dimmed cash trigger:** no sheet opens. The pane's ONE region (FloorDetailLive.tsx:1351) says
  the card's title sentence ("Mohinga is waiting for a manager"). The card is scrolled to centre (`auto` under
  reduced motion) and focus moves to "Decide it here" (to "Take payment anyway" when nobody can decide). This
  is the Phase 2c `onSettleBlocked` pattern with a second reason.
- **"Decide it here":** the card grows in place (FLIP 240ms; instant under reduced motion). Under the ticket
  line, THE ONE SLIP opens at pane width:
  - "T Thiri က တောင်းထား → [A Aye]";
  - "Aye, your PIN" and its field;
  - the Deny / Approve keys (190×64 each);
  - a quiet Cancel.

  Same rules as screen 2: Enter never submits; the pane's region, not a second one, speaks.

- **After a decision:**
  - The card unmounts only after the pane's re-read lands, and focus goes to `#settle-h`.
  - The trigger reads "စုစုပေါင်း ပြန်တွက်နေပါတယ်… / Updating the total…" with a 1em spinner until the server
    total arrives: **"Take cash · $59.67"** after an Approve, or $75.14 again after a Deny. The client never
    subtracts.
  - The region says the verdict sentence ("Approved — Mohinga is off Table 7’s bill.").
- **"Take payment anyway":**
  - It records an acknowledgement of exactly the pending approval ids on screen, and sends nothing by itself.
  - **The card keeps its footprint**, so nothing slides under the finger. The pair becomes "Decide it here"
    as a paper secondary on the left, plus, on the right, the note "မုန့်ဟင်းခါး စာရင်းထဲမှာ ရှိနေတုန်း
    ငွေရှင်းနေပါတယ် — တောင်းဆိုချက် ဖွင့်ထားဆဲ။ / Taking payment with Mohinga on the bill — the request stays
    open." (13 #6e6358). The consequence stays.
  - The cash trigger wakes as the hero, and focus moves to it.
  - Every settle door (cash, the reader, the tab close) then carries the acknowledged ids. The server refuses
    `approval_pending` only when a request arrived that the acknowledgement did not cover. The card then
    returns naming the new dish, and one more tap passes it: a re-warning, never a block.
- **Nobody here can decide** (the filtered roster is empty):
  - There is no "Decide it here".
  - On the counter pane, the consequence is replaced by "ဒီမှာ မုန့်ဟင်းခါး ကို ဘယ်သူမှ မဆုံးဖြတ်နိုင်ပါ။ အခု
    ငွေရှင်းရင် ဧည့်သည်က အဲဒါပါ ပေးရမယ် — စားပွဲ 7 လို့ အကူအညီ ကနေ ပြောပါ။ / Nobody here can decide Mohinga.
    Take payment now and the guest pays for it — report it from Help with Table 7.". On the standalone table
    page, which has no Help, the consequence sentence stays instead.
  - "Take payment anyway" becomes the card's primary, full width.
- **Roster unreadable:** "Decide it here" is still offered. Opened, the slip shows the shipped "Couldn’t load the
  list of managers — that doesn’t mean none are here. Try again." with Try again, and "Take payment anyway"
  stays. It never fails closed.
- **Several waiting at this table:** one card. The title names the oldest, and the ticket line lists each
  waiting dish (one row each). "Decide it here" opens the oldest first.
- **The guest's own phone:** not blocked (owner answer 2: dine-in phones pay at the counter).
- **Night:** the same geometry with the .dark tokens; the glyph square is #33231d with a #e0855f flag (5.50:1).

### COPY (English) — verbatim

- Take payment (not drawn in Both; the heading is Burmese only)
- Mohinga is waiting for a manager
- cooked · from Thiri · 6m ago · 1× Mohinga · $14.00
- Decide it here · Take payment anyway
- Mohinga is charged as it is. The request stays open; if a manager approves it later, refund it from Today’s
  payments & refunds.
- Taking payment with Mohinga on the bill — the request stays open.
- Nobody here can decide Mohinga. Take payment now and the guest pays for it — report it from Help with Table 7.
- Take cash · $75.14 · Take cash · $59.67 · Updating the total…
- Includes sales tax. Add a cash tip in the next step.
- They’d like to pay here at the counter · asked 2m ago
- $68.00 subtotal so far · 7 items
- Approved — Mohinga is off Table 7’s bill. · Approved — Mohinga is free on Table 7. · Denied — Mohinga stays on
  Table 7’s bill.
- Manager approval · Aye, your PIN · Deny · Approve · Cancel · Choose Approve or Deny. (the slip, opened)
- Pay at counter · Parata (2 pcs) · Mee-Shay
- Couldn’t load the list of managers — that doesn’t mean none are here. Try again.

### COPY (Burmese) — shipped strings or the briefs' drafts only

| String                                                                                                                                            | Source                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ငွေရှင်း                                                                                                                                          | shipped `table.detail.settle.title`, staff.ts:3061                                                                         |
| {x} — မန်နေဂျာ ဆုံးဖြတ်ချက် စောင့်နေတယ်                                                                                                           | DRAFT, m8.json → concepts[2].screens[4].copy_my (glanceable)                                                               |
| ဒီမှာ ဆုံးဖြတ်မယ် · ဒီအတိုင်း ငွေရှင်းမယ်                                                                                                         | DRAFT, m8.json → concepts[1].screens[5].copy_my (guided S6)                                                                |
| {dish} ကို လက်ရှိအတိုင်း ငွေယူပါမယ်။ တောင်းဆိုချက် ဖွင့်ထားဆဲ — နောက်မှ မန်နေဂျာ ခွင့်ပြုရင် “ဒီနေ့ ငွေရှင်းတာနဲ့ ပြန်အမ်းတာများ” ကနေ ပြန်အမ်းပါ။ | DRAFT K15-HIGH, m8.json → concepts[1].screens[5].copy_my (guided S6)                                                       |
| {dish} စာရင်းထဲမှာ ရှိနေတုန်း ငွေရှင်းနေပါတယ် — တောင်းဆိုချက် ဖွင့်ထားဆဲ။                                                                         | DRAFT, m8.json → concepts[1].screens[5].copy_my (guided S6)                                                                |
| ဒီမှာ {x} ကို ဘယ်သူမှ မဆုံးဖြတ်နိုင်ပါ။ အခု ငွေရှင်းရင် ဧည့်သည်က အဲဒါပါ ပေးရမယ် — {t} လို့ အကူအညီ ကနေ ပြောပါ။                                     | DRAFT K15-HIGH, m8.json → concepts[2].screens[4].copy_my (glanceable)                                                      |
| စုစုပေါင်း ပြန်တွက်နေပါတယ်…                                                                                                                       | DRAFT, m8.json → concepts[2].screens[4].copy_my (glanceable)                                                               |
| ငွေသားနဲ့ ရှင်း · {m}                                                                                                                             | shipped `settle.cash.trigger`, staff.ts:1708                                                                               |
| ရောင်းခွန် ပါဝင်ပါတယ်။ ငွေသား အပိုကြေးကို နောက်တစ်ဆင့်မှာ ထည့်ပါ။                                                                                 | shipped `settle.cash.hint`, staff.ts:1721-1724                                                                             |
| ကောင်တာမှာ ငွေရှင်းချင်ပါတယ် · တောင်းဆိုတာ                                                                                                        | shipped `table.detail.counterAsk/.counterAsked`, staff.ts:700-704                                                          |
| ယခုအထိ စုစုပေါင်း · ပစ္စည်း {n} ခု                                                                                                                | shipped `table.detail.subtotalSoFar`, `table.detail.item.many`, staff.ts:787, :789                                         |
| ချက်ပြီးသား · {x} က တောင်းထား · {n} မိနစ်က                                                                                                        | shipped staff.ts:504, :515, :717                                                                                           |
| ချက်နေဆဲ · ထုတ်ပြီး · ခွင့်ပြုချက် တောင်းထားပြီ · ဖျက် / အခမဲ့                                                                                    | shipped `table.line.state.*`, `table.line.approvalRequested`, `table.line.verb.voidComp`, staff.ts:2804-2805, :1214, :1218 |
| ကောင်တာမှာ ရှင်းမယ် · ယခုအထိ {m} · ပစ္စည်း {n} ခု                                                                                                 | shipped `floor.status.counter`, `floor.card.soFar`, `floor.card.item.many`, staff.ts:397, :421, :415                       |
| the slip, opened; the verdict sentences; the roster failure                                                                                       | as in screens 1–2 (shipped keys and glanceable drafts)                                                                     |

### A11Y

- **The settle section** is `aria-labelledby="settle-h"`. **The flag card** is a `<section
aria-labelledby="flag-title">`, plain text, never a live region; its glyph square is `aria-hidden`.
- **"Decide it here"** is a button with `aria-expanded` and `aria-controls` pointing at the slip.
  **"Take payment anyway"** is a button `aria-describedby="flag-consequence"`, so the consequence is read
  before the tap, beside the button and never in a dialog after it (§22).
- **The cash trigger** is `aria-disabled` (never native), described by the card's title first and the hint
  second: a disabled control names what unlocks it (§22). A tap is refused out loud, in the pane's ONE
  region, and focus moves to the way forward.
- **ONE live region:** the pane's (FloorDetailLive.tsx:1351). It speaks a refused tap, a verdict and a server
  `approval_pending`. The opened slip adds no region of its own here.
- **Focus moves:**
  - a refused trigger → "Decide it here";
  - Decide → the PIN (one eligible) or else the first tile;
  - a decision → `#settle-h`, after the re-read;
  - "Take payment anyway" → the cash trigger, now live;
  - a server re-warning → "Decide it here".
- **Targets:** the pair 54, the keys 64, tiles 64, PIN 52, the trigger 64, pills 44.
- **Reduced motion:** the card's FLIP, the scroll-to-centre and the trigger's figure roll are all off;
  "Updating the total…" is a word, not only a spinner.
- **Never colour alone:** the flag + the title word; Remove = minus-square + "ဖျက်"; the dim + the
  description.

---

## DECISIONS

1. **Backbone: GLANCEABLE "Raised Flag".** Owner answer 1: staff moments are glanceable.
2. **The flag lives only where a decision is made:** on the request card and the Take payment card. There is
   no band, and no pennants on the bar, tiles, floor cards or lines. This fixes the judges' "nag" and keeps
   lens rule 8.
3. **The bar keeps today's approvals circle; only its count goes live,** read from the board's own 5 s snapshot
   through context, so the page runs one poll. Graft (quiet/guided).
4. **When the queue freezes, the circle's border turns dashed,** and the count never shows a false 0
   (`countPendingApprovals` → `{ok:false}`). Graft.
5. **The "Open requests" zone chip appends its count**, inverted inside the lit cap. Graft (glanceable via the
   judges).
6. **One chip says what AND why.** Every chip wears its column's kind mark, so the duplicate labels never look
   alike. This fixes the judges' "prints Quality / guest unhappy in both columns".
7. **The consequence hint lives in the grid's empty right foot, reserved,** so nothing jumps and the sheet fits
   in 896px at Both.
8. **The picker lists only people who can sign:** active manager or owner, a PIN set, not the asker. All three
   concepts.
9. **Exactly one eligible arrives lit; two or more arrive with none lit,** because a pre-lit wrong name spends
   someone else's lockout.
10. **One slip component for the sheet, the card and the pane:** "Thiri → Aye", then "Aye, your PIN". Quiet's
    two names, guided's spoken step and the boarding pass's origin → destination.
11. **The asker line reuses the shipped "{x} က တောင်းထား / from {x}",** so the asker and the manager read the
    same words. Quiet restraint.
12. **The asker seam ships ON behind `ASKER_BY_PIN`,** drawn only on a manager-signed tablet. Judges'
    sequencing; the owner question is still open.
13. **The false "none are signed in right now" is retired** for glanceable's two true sentences.
14. **Decide → PIN → Approve.** The confirm stage and its five keys are removed (quiet + glanceable).
15. **The decision keys are the submit keys,** and Enter never submits when two verbs share the field. Graft.
16. **Approve is the primary and Deny a paper key with ✕,** 12px apart on opposite sides. Deny's ink is --tx,
    because Deny keeps money and warn means "a person is needed".
17. **The card prints the table NUMBER as a link to its pane,** and the dish in both scripts (the kitchen-ticket
    rule).
18. **Ages use the shipped RelativeTime,** never coloured: no "late" is ruled for approvals.
19. **The one delight:** a receipt row replaces the card (✓ disc, gift disc or ✕ square) in the very words the
    asker's line will show, with "Got it". Glanceable's moment.
20. **Make it free's mark is the shipped `gift` glyph,** not a drawn sparkle; the only new glyph is lucide
    `Flag`. Fewest new assets.
21. **No verdict or control quotes an amount drop,** because the bill drops by $15.47 with tax, not $14.00. The
    card's figure ships after M184 (ruling #5).
22. **A paid table gets a close-only card** that says what happened and links to Today's payments & refunds.
    Owner answer 4 + the judges' Deny-only graft.
23. **Take payment with a flag up:** a paper card names the dish and the consequence. The hero is "Decide it
    here" and the secondary "Take payment anyway", side by side; the trigger dims until one is used. Owner
    answer 4: never blocked.
24. **"Take payment anyway" acknowledges exactly the pending ids,** and every settle door carries them. The
    server re-warns (`approval_pending`) only for a request the acknowledgement did not cover. One binding
    (§22); graft.
25. **Everything at Take payment fails OPEN.** An unreadable roster still offers Decide with Try again, and
    nobody eligible makes "anyway" the primary. This fixes glanceable failing closed on the roster.
26. **The flag card keeps its footprint after "anyway"**, so nothing slides under Dad's finger.
27. **After a decision, the trigger says "Updating the total…"** until the server re-read: amounts are never
    optimistic.
28. **The flag card is paper with one warm glyph square:** no warn slab, no left rail. RULES; never louder than
    a Late ticket.
29. **The tablet sheet is drawn as shipped:** 544 wide, centred, no grab bar. This corrects the glance artboard.
30. **The zone chips and the approvals heading are Burmese-only, as shipped;** prose counts take Burmese
    digits. This corrects the glance artboards.
31. **The pending line in the pane keeps the shipped quiet badge.** The flag is not repeated on rows.
32. **Same example as the artboards:** Table 7, Mohinga $14.00, Thiri asks, Aye decides.

## OPEN RISKS

- **Money path.** The acknowledgement compare touches the three settle doors: cash (lib/staff-cart.ts), the
  reader (lib/terminal.ts) and the tab close. It needs:
  - a pure `staffSettleApprovalVerdict(pendingIds, ackIds)` in lib/ with mutants and a red-first suite;
  - the Codex wait (ruling #1; with Codex out of quota, OWNER_RULINGS §G, G3 · WORKFLOW §Review step 5 (g)).

  Sequence it with counter-floor's K39, or co-own it. If it is cut, the warning is client-only and the
  nightly PILOT §2 SELECT ("paid with a request still pending") is the only net.

- **Ships after M184.** Before it, Approve applies the line as it stands now, so the card's $14.00 can understate
  what comes off.
- **A paid-table close is recorded as `denied`** (the existing deny path). The owner's loss list cannot tell
  "closed after payment" from "the manager said no" unless M184's migration also adds a close arm (status
  `superseded`). That widens a file ruling #5 named by purpose, so it needs the owner's word.
- **The pending read behind the flag degrades silently** (floor.ts:809-816: a failed read shows no flag). The
  dish stays charged (the safe state), but the warning is then absent with nothing saying so. A
  `pendingRead: false` line would need new copy and a Burmese draft.
- **The asker seam is an unanswered owner question.** It ships ON behind one constant. It also:
  - spends lockout and the caller's step-up rate bucket on servers too;
  - reveals who has a PIN;
  - cannot help a server who has no PIN;
  - leaves a server-signed tablet attributing a request to the signed-in person even when other hands made it.
- **The roster is not presence.** Aye arrives pre-lit while out of the building. "Take payment anyway" and "No
  manager here? Request approval" are the ways out, and the sitting must confirm parents read them so.
- **The decision key IS the submit.** A valid PIN on the wrong key records the wrong verdict, and there is no
  Undo (reversing an approval needs DDL). The mitigations are the geometry, the shape and the fill. A
  mis-Deny is one re-ask.
- **Fit is budgeted, not measured.** The sheet is planned at 896px for Both at 1366×1024; the hint's three
  English lines, a long Burmese reason, a second eligible tile or the seam's second PIN all scroll the body.
  Measure headless in EN, MY and Both at 1366, 768 and 390 before merge.
- **One-chip what+why is the judges' doubt.** The kind marks and group names answer it on paper; the ruling #12
  device sitting must watch a parent pick "Quality / guest unhappy".
- **New seams:** a per-tongue `{x}` on `<Chrome>` for the sheet title and the flag card (`check:staff-lang` must
  accept it), lucide `Flag` in icon.tsx, and new CSS under the style-literals ratchet (tokens only).
- **The live count elsewhere** (KDS, table, menu and tips bars) would add Server Actions to Next's one-at-a-time
  queue (P2hh) unless poll-gated or moved to a GET route. Only the counter's count is in these three screens.
- **K43's badge clip fix is in flight;** the artboard draws today's −4/−4 badge.
- **The acknowledgement is per-pane client state.** A reload loses it and costs one more tap (the safe
  direction).
- **The one-manager-alone case stays open by design (D3).** It is counted honestly, never solved.
- **Burmese drafts await Min's native pass,** logged in a "K15 · staff-authority" row. The money words
  (consequence, verdicts, nobody-eligible, the flag title) go first and join `STAFF_K15_HIGH`, so their English
  survives a Burmese-only device.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

1. Owner answer 4, never blocked: Take cash is never dimmed and stays the live hero at full ink. The flag card above it is the warning, and its one button is 'Decide it here' (paper secondary). 'Take payment anyway' retires: tapping Take cash with a flag up IS the acknowledgement. That tap records exactly the pending ids on screen (every settle door carries them) and opens the till tray, whose head repeats the consequence sentence; the consequence is also Take cash's aria-describedby. A server approval_pending for an unacked id returns the card naming the new dish, and the next tap passes. This matches m2 ('Take cash stays LIVE') and m8's own maître d' line.
2. Verdict marks: an approved Remove shows the Remove kind mark (minus-square), not the green ✓ disc, because on this counter the solid ✓ disc means paid (m6's seal). Make it free keeps the gift disc and Deny keeps the ✕ square. The words are unchanged.
3. Request card: 'ချက်ပြီးသား · COOKED' and its flame drop to --t2 (a fact, not a call). The flag stays the card's call and the Remove kind keeps its danger tone, so the card has at most two warn marks.
4. The asked Table 7 composes with m2. The floor card shows 'ကောင်တာမှာ ရှင်းမယ် · ၂ မိနစ်' and no 'ယခုအထိ $68.00'. The pane draws m2's ask pass at the top (receipt glyph in --warn, $75.14 from settleTotalCents, no Next line) instead of the old shipped ask card with the #8f5009 glyph, and drops the '$68.00 subtotal so far' row. After a decision, the pass total and the trigger both read 'Updating the total…' until the re-read lands ($59.67).
5. Fidelity, screens 1–3: the floor grid is two columns of 413 at 1366 (FloorBoard minmax 18rem, as m2 and m7 measured), not three of 270. Draw one counter-bar geometry across m2, m7 and m8: m2 and m7 draw y0–84 with the stacked echo, m8 draws 76, so measure --staff-bar-h once and use it in all three.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **Owner answer 4 amendment not applied: Take cash is still dimmed, 'Take payment anyway' is still there, and 'Decide it here' is still the hero. The till tray is never mentioned.**
   - Evidence: picked-m8.md:17-20 and :52-54 (hero 'Decide it here', secondary 'Take payment anyway'); :759-760 ('The cash trigger is dimmed until one of the two is used'); :811-815 (Decide it here = Button primary, Take payment anyway = secondary); :821-823 (trigger aria-disabled, opacity .55, aria-describedby='flag-title settle-hint'); :830-833 (a tap on the dimmed trigger opens no sheet; focus goes to Decide); :849-858 (the anyway flow wakes the trigger); :865 and :867-868 (anyway becomes the primary, or 'stays'); :919-930 (anyway is described by the consequence; the trigger is described by the title; a re-warning sends focus to Decide); :982-990 (decisions 23-26); :1024 (open risk). The wiring it reuses is the dim-and-say gate at CashSettleButton.tsx:598-618 and primitives.css:50-54 (.55, no shadow), which is exactly what the amendment forbids. picked-m2.md:647-648 already says 'Take cash stays LIVE'. The shared vocabulary says nothing the owner said must never block is ever dimmed. Screen 3 also draws two primaries (Decide it here plus Take cash).
   - Fix: Take cash is never aria-disabled while a flag is up; it stays the full-ink primary xl hero with aria-describedby='flag-consequence settle-hint'. The flag card's one button is 'ဒီမှာ ဆုံးဖြတ်မယ် / Decide it here' as a paper secondary. Delete 'Take payment anyway', its Burmese ('ဒီအတိုင်း ငွေရှင်းမယ်'), the post-anyway note, the 'card keeps its footprint after anyway' state (decision 26) and the 'refused tap' state. A Take cash tap with a flag up IS the acknowledgement: it records exactly the pending approval ids on screen (every settle door carries them) and opens the crowned till tray (m6), whose head repeats the consequence sentence (existing K15-HIGH draft). A server approval_pending for an unacknowledged id closes or refuses the tray, returns the card naming the new dish, and keeps focus on Take cash so the next tap passes. 'Nobody here can decide' and 'roster unreadable' then just drop or keep 'Decide it here'; Take cash is the hero in every variant. Rewrite decisions 23-26 and the open risk to match.
2. **Two filled primaries in one state: when 'Decide it here' opens the slip in the pane, the slip's Approve key (primary gradient) sits above the live Take cash (primary xl). This survives the amendment.**
   - Evidence: picked-m8.md:834-841 (the slip opens in place inside the flag card, with Deny/Approve keys 190×64); :570-571 (Approve = 'the primary gradient'); under owner answer 4 plus the amendment, Take cash stays 'the live hero at full ink' directly below (:821). That breaks the standing rule 'one hero verb per state (one primary, everything else secondary)' and RULES.md:139-143 ('ONE primary per section'). The spec's own open risk (:1026-1028) leans on fill and shape to prevent a mis-key, so a second gradient 160px away is a real hazard on the money screen.
   - Fix: Open 'Decide it here' as the shipped centred tablet Sheet (544-wide dialog, globals.css:11313-11325, the same one slip as screen 1), so the deciding state's only primary is Approve and Take cash keeps full ink, untouched, behind the scrim. On close or verdict, focus returns to #settle-h (or to Take cash) and Take cash is the one hero again. Alternatively, state explicitly how the in-pane slip keeps one primary without dimming Take cash. As drawn it has two.
3. **The paid-while-waiting card quotes 'Mohinga was charged $14.00'. That is a pre-tax, request-time snapshot presented as a fact about the charge, and 'Paid' is derived from a boolean that also covers cancelled carts.**
   - Evidence: picked-m8.md:622-631 and :672 ('Table 7 paid while this was waiting — Mohinga was charged $14.00.', Burmese draft '{dish} အတွက် {m} ယူပြီးပါပြီ'). The $14.00 is mms_approvals.amount_cents, a snapshot taken at request time (approvals.ts:345-347; M184, OPEN-ITEMS.md:202: the line can change after asking). The guest actually paid the line plus its tax share, $15.47, by the spec's own math (:94), and the in-app line refund the card links to offers 'the line's discounted goods + its tax share' (refunds.ts:53). The spec contradicts itself: :43-44 says 'no screen quotes a drop amount… never $14.00'. Separately, 'Paid' is keyed on `cartOpen` false (:179, :622), but qr_carts.status is in ('open','paid','cancelled') (20260618000000_qr_platform_init.sql:141), so 'not open' is not 'paid'.
   - Fix: Derive the state from qr_carts.status === 'paid' (a cartStatus field, not cartOpen). Either drop the figure, or fill {m} with a server-derived charged amount for that line from the paid order (qr_order_items goods plus tax share, the same figure lineRefundableCents offers), never the request snapshot. If the figure is dropped, the Burmese draft needs a native pass rather than an invented edit.
4. **The asked Table 7 does not compose with m2 (system amendment). The floor card shows the pre-tax sum, the pane draws the old shipped ask card and keeps the subtotal row, and only the trigger says 'Updating the total…'.**
   - Evidence: picked-m8.md:779-780 (floor card 'ကောင်တာမှာ ရှင်းမယ် / Pay at counter' and 'ယခုအထိ $68.00 · ပစ္စည်း ၇ ခု'); :792-793 and :887 ('$68.00 subtotal so far · 7 items'); :794-797 (the shipped ask card with the receipt glyph in #8f5009); :843-847 (only the trigger reads 'Updating the total…'). m2 draws the asked card as 'ကောင်တာမှာ ရှင်းမယ် · ၄ မိနစ်' with the so-far money HIDDEN (picked-m2.md:561-569). The pass sits at the top of the detail with the receipt glyph in --warn and settleTotalCents big (:586-604), the subtotal row is not drawn on an asked table (:605-609), there is a cash-only line under the hint (:622-624), and Tile 7 in the table strip is the room's ONE filled ask tile (:544-546). m8's main column has no table strip at all (:771-781). FloorStatusChip renders no echo (FloorStatusChip.tsx:58), so '/ Pay at counter' is not drawn in Both.
   - Fix: Floor card: 'ကောင်တာမှာ ရှင်းမယ် · ၂ မိနစ်', no 'ယခုအထိ $68.00 · ပစ္စည်း ၇ ခု' and no echo. Draw m2's main column (strip label, the 10-tile strip with Tile 7 as the one filled ask tile, the h2, then the grid). Pane: m2's ask pass at the top (receipt glyph in --warn, 'Total' with $75.14 from detail.settleTotalCents, the dotted seam and torn foot, no Next line) replacing the shipped ask card. Drop the subtotal row and add m2's cash-only line under #settle-hint. After a decision, BOTH the pass total and the trigger read 'စုစုပေါင်း ပြန်တွက်နေပါတယ်… / Updating the total…' until the re-read lands ($59.67). Re-budget the pane's height (pass ~294 + order + flag card + trigger do not fit in one 908px scroll), and say which scroll position is drawn so the pass is not drawn while 'scrolled to its end'.
5. **An approved Remove still shows the green solid ✓ disc. The amendment requires the Remove kind mark (minus-square), because on this counter the solid ✓ disc means paid (m6's seal).**
   - Evidence: picked-m8.md:15 ('✓ disc (removed)'); :597-601 ('a ✓ disc (#346e47 fill, #fffdf8 check) for an approved Remove'); :654-655 (Night '✓ disc is #5fb07e'); :744-745 ('verdicts = ✓ / gift / ✕ square'); :974-975 (decision 19). Shared vocabulary: 'A SOLID ✓ DISC means done… it never marks an approval', and GREEN is filled only where a payment just landed.
   - Fix: Approved Remove: the 32px Remove kind mark (radius-8 #f6e9e4 square with the #a44b34 bar) plus the unchanged words 'ဖျက်ပြီး · Aye ခွင့်ပြုထား / Removed · Aye approved'. Make it free keeps the gift disc and Deny keeps the ✕ square. Remove the green fill from the verdict row in both themes and update :15, :600, :654-655, :745 and :974.
6. **The request card carries three or four warn marks. 'ချက်ပြီးသား · COOKED' and its flame are drawn in warn ink, against the amendment's 'at most two warn marks'.**
   - Evidence: picked-m8.md:543 (flag #a44b34), :546-547 (Remove mark plus 'ဖျက် · REMOVE' in #a44b34), :550-551 (flame 16 #a44b34, 'ချက်ပြီးသား' #a44b34, ' · COOKED' #a44b34); card B at :582-583 repeats the cooked mark. Vocabulary: warn means a person must act or money is at risk; 'cooked' is a fact.
   - Fix: Draw the flame, 'ချက်ပြီးသား' and ' · COOKED' in --t2 #6e6358 (5.76:1 on --cd) on both cards. The flag stays the card's call and the Remove kind keeps its danger tone: two warn marks at most.
7. **Wrong counter geometry on all three screens: a 3×270 floor grid, a 76px bar (m2 and m7 draw 84, m6 draws 68), and the sticky pane head is missing from the scrolled pane.**
   - Evidence: picked-m8.md:265 and :774 ('three columns of 270, gap 14'). FloorBoard.tsx:637-644 uses repeat(auto-fill, minmax(min(100%,18rem),1fr)) with gap --s3; at the 838px main column (globals.css:14694-14699: 1fr | 464, gap 24) that gives 2×413, exactly as picked-m2.md:553 and picked-m7.md:170/:447 draw it. The bar is drawn y0–76 with the strip at 76–136 and the pane sticky at 92 (:253, :260, :267, :500, :508, :590, :766, :768, :783, :786); the 76 is only --staff-bar-h's FALLBACK (globals.css:14710), not a measurement. m2 and m7 draw 0–84 with the pane at 100 (picked-m2.md:528, :580; picked-m7.md:122, :254); m6 draws 68 (picked-m6.md:235). From the CSS (globals.css:10756-10817: padding 10+10, Padauk 30×1.3, echo 13×1.05, 1px border) the bar comes to ~74px, so none of them is measured. In screen 3, Parata's row is drawn at the pane's top (:786), but .staff-pane-head is sticky at top:0 inside the pane from 48em (globals.css:14758-14773), so 'စားပွဲ 7' and its ✕ must still show there.
   - Fix: Measure --staff-bar-h once (headless at 1366, Both, with the stacked echo) and use that one value for the bar, the strip, the pane's sticky top (bar + 16) and the zone heading in m2, m6, m7 and m8. Redraw the floor as 2×413 with gap 12 in screens 1 and 3. Draw the sticky 60px pane head ('စားပွဲ 7' + 44px ✕) at the top of screen 3's pane.
8. **Warn ground fills and the flag are used outside the places the vocabulary allows. The zero-eligible variant (a) turns that warn fill into a nag during normal service.**
   - Evidence: picked-m8.md:354-360 (in the ASKER'S SHEET, an inset with #f6e9e4 fill, a warn border and a 20px flag); :619-621 (the same inset inside the request card, repeating the strip's flag, so one fact is marked twice); :635-637 (the 'Changed after asking' #f6e9e4 band with 13/700 warn text). Vocabulary: 'A warn ground fill is used ONLY for a Late ticket and the floor's one ask tile', and 'FLAG… drawn only on the request card and at Take payment'. The spec's own decision 2 (:943-945) also puts the flag only where a decision is made. Variant (a) fires every time the only signer is the asker, for example on a tablet signed in as Aye with the seam off (:374-375): an ordinary loss request on a one-manager counter.
   - Fix: Zero-eligible insets: plain --sf ground, 1px --bd, --t2/--tx text, no flag and no warn fill (in the sheet and on the card; the card's strip flag already carries the fact). The changed-after-asking band: no fill, a △ glyph in --warn plus the words in --tx/--t2.
9. **The approve/deny verdict is assigned to a live region the same state removes, so it is either lost or announced twice alongside the focused receipt row.**
   - Evidence: picked-m8.md:597-613 ('The card is replaced in place by a receipt row… focus moves to it… The card's region says the sentence once') against :731-732 ('ONE live region per card, existing only while its decision is open'). In shipped code an ok drops the card through onResolved (ApprovalsBoard.tsx:486-493), and its role=status lives inside the decision form (:747-759). A region unmounted on ok cannot speak. A region freshly mounted with content is not reliably announced. If it does speak, it doubles the headline that focus on the tabIndex -1 row already reads.
   - Fix: Pick one channel and say which. Either focus the receipt row (its headline is the announcement) and say nothing else, or say the verdict sentence in the floor's existing region (the screen's one state region, ApprovalsBoard.tsx:333-336) and do not move focus. Do not attribute it to the card's region.
10. **The new 'Open requests' zone-chip pip draws a Burmese digit at 11px weight 800, and it marks the waiting count a third time on screen 2.**

- Evidence: picked-m8.md:513-515 (pip '၂', 20 tall, 11/800); decision 5 (:950). RULES.md:92-93 and the spec's own A11Y (:481) set every Burmese run at Padauk 400/700 and ≥13px. Screen 2 already shows the same count on the bar circle's badge '၂' (:503-505) and in the count line 'စောင့်နေတာ ၂ ခု' (:524). Vocabulary: 'No fact is marked twice on one screen.'
- Fix: Drop the pip, at least when the zone is lit or in view (the bar circle already carries the live count). If it is kept for off-screen zones, use Padauk 700 ≥13px (lang='my'), at least 22 tall.

11. **Wrong citation: ruling #24 is cited at OWNER_RULINGS:70, but line 70 is ruling #23 (C27).**

- Evidence: picked-m8.md:201 ('Ruling #24 (OWNER_RULINGS:70)'). docs/OWNER_RULINGS_2026-10-07.md:70 is '| 23 | C27 …' and ruling #24 'Refunds in Stripe' is at :71. Every other file:line I checked holds: staff.ts keys, LossActionSheet, voids, staff-pin, rate, approvals, floor, FloorDetailLive, CashSettleButton, ApprovalsBoard, ManagerPinStepUp, globals.css, the migrations, and the brief/m8.json drafts.
- Fix: Cite docs/OWNER_RULINGS_2026-10-07.md:71.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- ASKER_BY_PIN ships ON while the brief's owner question is still open (brief-m8.md binding rules, 'Owner question'). Ship it OFF until the owner answers. It spends the caller's step-up bucket (rate.ts:62), reveals who has a PIN, and puts a second PIN field into the fit budget.
- Receipt rows stay 'until Got it or the page is left; there is no timer' (:612). On a busy counter they pile up in a zone the poll has already emptied. Retire a row when the next card is decided or when the zone leaves view, so the 'Open requests' zone never shows stale verdicts beside 'Nothing to approve'.
- The Approve key carries a bare ✓ glyph (:570). The verdict vocabulary now reserves the ✓ for done or paid. Consider the request's kind mark (minus-square or gift) on Approve, so a check never means an approval.
- In the till tray head, set the consequence sentence at ≥15px Padauk 700 (not 13/400 as on the flag card). It is the money sentence Dad reads at arm's length just before taking cash.
- Measure the bar for m6 too (it draws 68, picked-m6.md:235); the till tray's top edge depends on the same --staff-bar-h.
- The open risk at :1013-1015 implies a new 'superseded' status. The status already exists (20260622080000_approvals_primitive.sql:23-28, used by merge and clear-counter-cart). Only a resolver arm is new, which may shrink the ruling-#5 widening the risk worries about.
- Add a reduced-motion line for the 1em spinner beside 'Updating the total…' (:845). The RM list at :933-934 covers the FLIP, scroll and figure roll but not the spinner.
- 'Several waiting at this table' (:869-870): with the amendment, the till tray head should name every waiting dish, not only the oldest, because that tap acknowledges all the ids on screen.
- Screen 3 states the pending fact twice: the Mohinga row's 'ခွင့်ပြုချက် တောင်းထားပြီ' badge and the flag card. Consider leaving the row badge out of the settle viewport, or accept it explicitly as text rather than a mark.

### D · Round 3 (2026-10-07, under the owner's delegation) — these win over everything above

The owner delegated every open decision ("I trust you to apply world-class design-thinking best standards on
all open decisions") and added a live TV board, card / Apple Pay after the food is served, and animated step
guides. PATH_DESIGN_2026-10-07.md's round-3 section records the decisions (D1–D5) and the shared vocabulary.
The round-3 consistency pass gave this moment these changes:

1. D2: the paid-table card's 'Close it' runs mms_resolve_approval(p_decision => 'close').

- It is admitted only when the cart has left open (paid, or cancelled by a clear), and returns still_open otherwise.
- It writes 'superseded', records the PIN-proven closer in approver_staff_id, sets resolved_at, and never touches the line, which stays charged.
- The card reads 'Table paid first · closed by Aye'. The cause is derived from the cart's terminal status.
- The request's own asker may close it.
- deny is unchanged.
- Retire decision 22's 'runs the existing deny path', the risk at :1013-1015 and the :180 consequence.

2. D2 review and sequencing:

- A later refund shows beside the request as its own fact: a kind='refund' row plus mms_refunds with its tender, at its own server-derived amount, grouped by session_id. A superseded row is never summed into losses and never quotes the request's snapshot. No backfill.
- The arm rides in M184's migration (same signature and grants, no CHECK change), disclosed in the file header and on M184's merge-window line. M184's PR also retires the shipped 'deny it' advice.
- If the owner holds the widened line, the arm moves to its own migration, and until then the paid card ships with NO Close key.
- 'ပိတ်မယ်' is a draft for the native sitting.

3. D4: ASKER_BY_PIN is not built, not even as dead code.

- Ship the zero-eligible sentences (a) and (b).
- 'No manager here? Request approval' goes to Open requests, and the dish stays charged.
- Take cash is never dimmed.
- Record the reopen trigger (an active server-role account with a PIN, plus a request stuck pending on its only possible signer, or the owner's word) and the build conditions (i) to (vii).

4. Marks:

- A superseded request carries no approval glyph: never ✓ (✓ means paid on the counter) and never the deny mark.
- The request card's dish rows carry the Kitchen Track glyph beside their shipped ထုတ်ပြီး or ချက်နေဆဲ word.

5. Cross-surface:

- Approvals never appear on the wall.
- An approved Remove takes the dish off the wall and off the guest's pass: struck 'Removed', no track, and it never holds D5's door.
- An approved comp keeps its track: it still cooks and holds the phone's door until served.
- Staff settle doors are never gated by served, just as they are never blocked by approvals (correction 13 unchanged).
