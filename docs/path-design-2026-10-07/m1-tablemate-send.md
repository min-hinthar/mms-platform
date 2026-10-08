# picked-m1 — "Next Stop: Kitchen", elevated

Moment m1: a tablemate adds a dish, and it waits on someone else's Send.
Backbone: GUIDED, the owner's pick for diner moments. The screen says the next step and who takes it.
Grafted in:

- from QUIET: the console's own words 'Not sent yet · မပို့ရသေး'; the fewest new claims; no counts; no toast, no sound.
- from GLANCEABLE: the hold-up card at arm's length, its shape language (hollow ring vs solid disc), and its one moment of delight.
- owner answer 3: the words, the big "Show a server" card, and the quiet "Let Aye know" nudge.

Example data, the same across all three screens: Table 7, a party of two. **Aye** is the host, the only phone that can Send. Avatar #1f6e63 'A'. **Thiri** is a guest. Avatar #6e4070 'T'. Two waiting dine-in drafts:

- Thiri's **2 Mohinga** / မုန့်ဟင်းခါး, $28.00 (docs/data/MENU_REFERENCE.md:27)
- Aye's **Coconut Rice** / အုန်းထမင်း, $3.50 (:55)

Total **$31.50**. It is illustrative and server-derived (`orderTotalCents`). No amount is ever optimistic.

The world-class references, each brought down to this family's room:

- **A great maître d'.** The guest is told what happens next and by whom. The host is named the way the table named them, never "Guest", and is read from server truth. The guest is never told to do something the code cannot do.
- **A Japanese meal-ticket counter (食券).** The Show-a-server card is the ticket. Table number big, the dishes in the console's own words, the qty in the kitchen's own token. Dad matches it to his screen at a glance, without translating.
- **A boarding pass in a wallet.** One full-screen object with one identity ("Table 7") and one live status line. The status changes in your hand like a gate change: when Dad presses Send, the card turns to "Sent to kitchen · ပို့ပြီး". That flip is the moment's single delight.
- **A great KDS.** The qty sits in a 44px token: a ringed numeral for a single, accent-filled for a multiple. This is the exact grammar Mom reads on the kitchen screen (`kds-line.ts:121` `qtyStands`; `globals.css:8050-8069` `.kds-qty`).

---

## CLAIMS VERIFIED AGAINST THE CODE (HEAD f6e81ce)

Each product claim the three screens depend on, with its evidence. Where a claim failed, the design changed. The claim stayed honest.

| Claim                                                                           | Verdict                                       | Evidence → design consequence                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Only the host can Send. The server enforces it.                                 | TRUE                                          | `lib/cart.ts:282` (`role !== "host"` → `not_host`, before `mms_fire_cart`). Checkout gates the button too (`components/Checkout.tsx:371-373`). Guests get no Send anywhere.                                                                                                                      |
| "Our staff can send it too."                                                    | TRUE                                          | `lib/staff-send-view.ts:181-182`: a host table gets a secondary console Send with the host note. `lib/checkout-stage.ts:96`: "The console can ALWAYS send". `lib/i18n/staff.ts:2724-2727`: "send here only if the table asks". The card IS that ask.                                             |
| Staff can't send while a tablemate's payment is in flight.                      | TRUE                                          | `staff-send-view.ts:164` (`blocked = paymentInFlight ? "paying"`); `cart.ts:279` (`locked`). → **Both ways forward hide under a pay lock.**                                                                                                                                                      |
| On /cart the host's name comes from server truth.                               | TRUE                                          | `lib/split.ts:85-98`: `session_members.role` and `display_name`, read service-side. → No `/api/session` change is needed. Guided's change was only for the /menu card, which is dropped.                                                                                                         |
| The default name "Guest" never reads as a person.                               | FALSE today                                   | `Checkout.tsx:376` passes "Guest" through as `hostName`. The default comes from `packages/db/src/schemas.ts:39`. → **`chosenName()`** (graft 3) maps the default to the role sentence (`confirm-copy.ts:121`).                                                                                   |
| "The kitchen sees it when the countdown ends."                                  | TRUE                                          | `lib/counter-order.ts:221-225`: dine-in lines in grace are HIDDEN on the KDS. Also `lib/kitchen.ts:98-99`. The grace is 10 s (`supabase/migrations/20260622050000_undo_grace.sql:23`).                                                                                                           |
| The diner Undo's count is aria-hidden. This is guided's a11y note.              | FALSE                                         | `components/SendToKitchenButton.tsx:279-284` renders "Undo — Ns" as the whole label. → Adopt the staff pattern from `staff.ts:2703-2706`: the name is the verb "Undo" and the count is an aria-hidden leaf.                                                                                      |
| A double-tap can't un-send.                                                     | FALSE today (P2y)                             | `SendToKitchenButton` never calls `undoTapHeld`. The helper exists at `lib/send-grace.ts:51`, with `SAME_GESTURE_MS = 350` at `packages/ui/src/gesture.ts:15`. → Adopted on both relabels.                                                                                                       |
| Presence can carry the nudge on /cart.                                          | FALSE today                                   | Presence lives only in `TableCartProvider` (`:309`), which is mounted only on /menu (`app/(order)/menu/page.tsx:164`). → **/cart joins the same channel.** Checkout already holds the anon token (`Checkout.tsx:858,885`). `SplitContext` gains `sessionId`, which is in scope at `split.ts:76`. |
| The channel is private to the table's members.                                  | TRUE                                          | `supabase/migrations/20260618000000_qr_platform_init.sql:248-256` (`rt_member_read` / `rt_member_send`, `is_member`). Staff are not members, so they see nothing new. Payloads are client-asserted and sanitized (`lib/realtime.ts:18-26,71-80`).                                                |
| "Aye can see you're waiting." (quiet draft)                                     | Only TRUE while Aye's phone is on the channel | Presence drops when a phone sleeps or leaves the page. → **The nudge is offered, and its confirmation shown, only while the host's seat is in presence.** No delivery is ever claimed.                                                                                                           |
| There is no diner→staff call signal.                                            | TRUE                                          | `docs/OPEN-ITEMS.md` P2dt (line 344): "tables flag staff by hand". → The card claims nothing beyond being shown in person: no "we've told the counter".                                                                                                                                          |
| The card can list the waiting dishes in both languages from the confirmed view. | TRUE                                          | `CartItem` carries `name`, `nameMy` (live catalog), `qty`, `lineState` and `fulfillment` (`lib/cart.ts:740-764`). Send fires dine-in drafts only (`checkout-stage.ts:82-88`), so to-go drafts are not listed.                                                                                    |
| /cart observes the draft→fired edge live.                                       | TRUE                                          | `Checkout.tsx:885` (`useCartRealtime`, re-reads the server view).                                                                                                                                                                                                                                |
| A table may have no number before its first Send.                               | TRUE                                          | §33 binds the table at Send. The floor labels such a session by its code (`lib/floor.ts:505`). → The card falls back to "Table code" plus the code (`components/InviteSheet.tsx:82`).                                                                                                            |
| The floor's "not sent" mark could be reused on diner screens.                   | Rejected                                      | It is an 8px solid `--warn` dot (`app/globals.css:14490-14497`), a staff alarm in the danger colour. → Diners get the hollow ring / solid disc pair (graft 5).                                                                                                                                   |
| Today's Order stage shows a count on the shared cart.                           | TRUE (and removed)                            | The "N items not sent yet" door note at `Checkout.tsx:3944-3948`. → Removed for guest and host. The wait block says the state once, as words.                                                                                                                                                    |
| A full-screen modal primitive exists.                                           | PARTLY                                        | The Sheet is built on `@radix-ui/react-dialog` (`packages/ui/src/sheet.tsx:2`). A full-screen variant on the same Radix Dialog is new and gets focus trap, Esc and inert background for free.                                                                                                    |

---

## SCREEN picked-m1-1.dc.html — Your order: what happens next, and two ways forward

**Device:** phone 390×844. **Theme:** light. Night is described at the end of the screen.
**Who and when:** Thiri, a guest, on /cart Order stage. Her 2 Mohinga and Aye's Coconut Rice wait on Aye's Send. Aye's phone is open on the table channel, so the nudge is offered. The frame is **scrolled to the end of the page** (scrollY 240). At scroll 0 the status heading and the "Next:" sentence already sit above the fold, at y 619–760. The actions follow one thumb-scroll below.

### LAYOUT (frame coordinates, scrollY 240)

- **0–103 AppHeader, sticky.**
  - 0–47 is empty ground, the safe area.
  - The 47–103 row is unchanged: logo 51×34, then "Morning Star" in Fraunces 16/800.
  - Scrolled content passes under it.
- **45–168 line card 1, Thiri's own draft.** Its top 58px is under the header.
  - Unchanged product card (`.card.card-textured.checkout-line`), drawn as `m1-quiet-2.dc.html` draws it.
  - Contents: 50×50 thumb r12, "Mohinga" 16/600, MY name 13px #6e6358, owner row (Avatar sm 22 'T' #6e4070 + "You", 13px #6e6358), "$28.00" 16/700.
  - Right column: the stepper − 2 + (44px circles) over the 44px ⋯.
- **176–299 line card 2, Aye's draft.** Read-only on Thiri's phone.
  - Same card: "Coconut Rice", 'အုန်းထမင်း', owner Avatar 'A' #1f6e63 + "Aye", "$3.50".
  - Its quantity controls show as `aria-disabled` at opacity 0.6, as in m1-quiet-2.
- **313–363 Total door, in its QUIET form.** The guest's hero is no longer the bill.
  - Hairline top 1px rgba(58,35,23,0.1). Left: "Total" 16/800 + 'စုစုပေါင်း' 13px #6e6358, baseline row, gap 8. Right: "$31.50" Fraunces 21/800 tabular + an 18px → arrow, stroke #a65f10. min-height 50.
  - The "2 items not sent yet" note under it is **removed**.
- **379–715 THE WAIT BLOCK** (`<section aria-labelledby="wait-h">`), x 20–370.
  - No card, no fill: it sits on the page ground. This is quiet's restraint, and nothing new is drawn as a container.
  - It is a two-row itinerary. A 30px lead column carries "who" marks; the text column runs x 60–370.
  - **379–403 heading (h2 `id="wait-h"`).**
    - At x 20, a hollow ring glyph 16×16: circle r6.5, stroke 2px #6e6358, no fill, aria-hidden.
    - Gap 10, then "Not sent yet" in Fraunces 17px 600, letter-spacing -0.02em, #1b1714.
    - Then "·" with margins 0 8px, #6e6358, aria-hidden.
    - Then 'မပို့ရသေး' in Padauk 15px 700, #6e6358, `lang="my"`.
    - Separators are margins, never whitespace text nodes.
  - **415–520 row B, the next step.**
    - Grid 30px | 1fr, gap 10.
    - Lead: Avatar md 30px, #1f6e63, white 'A' 12px 800. Top-aligned at y 417, aria-hidden.
    - Text, EN: 14px, lh 1.45, weight 600, #1b1714, two lines (415–456). "Next:" is weight 800 in #8f5009, then the sentence.
    - Text, MY: 13px Padauk 400, #6e6358, lh 1.6, three lines (458–520). "Aye" sits in a `lang="en"` Hanken span.
  - **520–564 "Let Aye know", the secondary.**
    - A `<button type="button" class="nav-link">` starting at x 60, aligned with the text.
    - min-height 44, padding 10px 2px, #a65f10, 14px 700.
    - Label: "Let Aye know", then a "·" with margins 0 6px, then 'Aye ကို ပြောလိုက်မယ်' in 13px Padauk 700. Width is auto, about 250px.
    - No icon, no fill, no border.
  - **572 hairline**, x 60–370, 1px rgba(58,35,23,0.1). It is aligned with the text column, as an itinerary rule, not full width.
  - **581–643 row C, the other way.**
    - Grid 30 | 1fr, gap 10.
    - Lead: a 30px disc, #f2efe7 with a 1px rgba(58,35,23,0.1) border, holding a 16px receipt glyph (stroke #8f5009, 2px, round caps), aria-hidden. It is the same receipt mark the shipped Pay-at-the-counter card wears (`components/PayAtCounter.tsx:85-87`): the "show this" family.
    - Text, EN: 14px 400, #6e6358, lh 1.45, two lines (581–622). `id="wait-staff"`.
    - Text, MY: 13px Padauk 400, #726859, one line (622–643).
  - **657–715 PRIMARY "Show a server".** This is the Order stage's ONE `.checkout-cta`.
    - x 20–370, min-height 58, radius 12 (the checkout CTA radius, as on Send).
    - Background linear-gradient(180deg, #a65f10, #8f5009). Shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px -1px rgba(166,95,16,0.42)`.
    - Centred stack: EN 16px 800, -0.01em, #fffdf8, lh 1.2; then MY 13px Padauk 700, #fffdf8.
- **723–739** Checkout's single status region (`<p role="status">`, `Checkout.tsx:4188-4200`). It is empty and nothing is drawn.
- **750–844 diner tab bar.** Menu · **Order** (current, #8f5009, `aria-current="page"`) · Account. No badge on Order, because this is a shared cart.

### STATES (described, not drawn)

- **Aye's phone is not on the table channel** (asleep, or on a page without the channel). Row B has no "Let Aye know". The hairline follows the MY sentence directly. Nothing claims Aye can be reached.
- **After Thiri taps "Let Aye know".**
  - This phone tracks `{seat, name, waiting: true}` on its presence entry. The flag rides every page that joins the channel, and is kept for the round in sessionStorage behind try/catch.
  - The button is replaced in place by a static two-line paragraph, the same 42px: "Aye can see you're waiting." in 13px #6e6358, then its MY in 13px Padauk #726859.
  - The paragraph is shown only while Aye's seat is in presence. If Aye leaves, it hides. It never claims delivery.
  - One nudge per draft round. The flag clears on the observed send edge, or when the table has no drafts, or when this phone's presence leaves.
- **The nudge fails** (`track()` does not answer ok). The button stays, and the one region says the shipped "That didn't go through — please try again." (`useUndoGrace.ts:166`).
- **Aye's name is the default "Guest", or blank** (`chosenName` → null).
  - Row B uses the shipped role sentence (`confirm-copy.ts:121-122`).
  - The lead avatar becomes a 30px #efece2 disc with the receipt glyph.
  - The secondary reads "Let them know"; the confirmation reads "They can see you're waiting." Both are English-only.
  - Row C uses the role branch.
- **A tablemate is paying** (peer lock). The shipped lock line leads (T37: one lock sentence). The block keeps its heading and row B, and **both actions hide**: nobody, staff included, can send until the lock lifts. They return when it lifts.
- **Hostless table** (`host_seat` null). No wait block. The hero is the shipped Total door "View bill & pay", and pay fires the drafts (`checkout-stage.ts:72-78`).
- **The table's drafts go** (an observed draft→fired edge in two consecutive applied views, never a clock).
  - The block unmounts and the Total door becomes the hero again (`orderStageHero` → bill).
  - The one region says the shipped "Your order's with the kitchen." once (`lib/i18n/cart.ts:57-60`).
  - If focus was inside the block, it lands on the Total door.
  - If the host undoes inside the 10 s grace, the block simply returns, with no announcement.
- **Night:**
  - ground #100c19; text #f3ecdf; --t2 #bcafc8; --t3 #a69eb1
  - ring stroke #bcafc8; receipt disc #211a30 with a #e7a53a glyph
  - primary flat #e7a53a with #130d1e ink (8.91:1); link #e7a53a (9.04:1 on #100c19)
- **Reduced motion:** the block appears without `.mms-rise`; the swap to the confirmation is instant. Nothing else in this view moves.

### COPY (English)

- Not sent yet (`pad.group.unsent`, staff.ts:2909; diner `DINER_STATE_COPY.draft`, line-state-copy.ts:13)
- Next: Aye sends the table's order to the kitchen — your dishes go with it.
  - "Next:" is new. The sentence is shipped `hostSendsCopy`, named branch (confirm-copy.ts:120).
  - Role branch: "Next: One person at your table sends the order to the kitchen from their phone — your dishes go with it." (confirm-copy.ts:121)
- Let Aye know. Role branch: "Let them know" (quiet's owner-prototype draft)
- Aye can see you're waiting. Role branch: "They can see you're waiting." (new)
- If Aye is away, our staff can send it too. Role branch: "If they're away, our staff can send it too." (quiet draft; true per staff-send-view.ts:181-182)
- Show a server (the owner's own words)
- Total · $31.50 (cart.ts:93; the door's name is "Total · $31.50 — View bill", Checkout.tsx:3898-3902)
- Line meta, unchanged: "You" / "Aye" owner rows (Checkout.tsx:3112-3129)
- Spoken only: "That didn't go through — please try again." (useUndoGrace.ts:166) · "Your order's with the kitchen." (cart.ts:57-60)

### COPY (Burmese)

- မပို့ရသေး — shipped, the console word (staff.ts:2909 `pad.group.unsent`; K15-HIGH root at staff.ts:2802)
- Row B, named: နောက်တစ်ဆင့် — Aye က စားပွဲရဲ့ အော်ဒါကို မီးဖိုချောင်ဆီ ပို့ပေးပါမယ် — သင့်ဟင်းတွေလည်း တစ်ခါတည်း ပါသွားပါမယ်။
  - The prefix "နောက်တစ်ဆင့် —" is the guided brief's draft (brief-m1.md:218-220).
  - The sentence is the shipped `hostSendsCopy` MY (confirm-copy.ts:122). Composing the two adds no new words.
- Row B, role: နောက်တစ်ဆင့် — စားပွဲက တစ်ယောက်က သူ့ဖုန်းကနေ စားပွဲရဲ့ အော်ဒါကို မီးဖိုချောင်ဆီ ပို့ပေးပါမယ် — သင့်ဟင်းတွေလည်း တစ်ခါတည်း ပါသွားပါမယ်။ (same sources, null branch)
- Aye ကို ပြောလိုက်မယ် — brief draft (m1.json, quiet screen 6, "Let Aye know")
- စောင့်နေတာ Aye မြင်ရပါပြီ — brief draft (m1.json, quiet screen 6)
- Aye မရှိရင် ဝန်ထမ်းကလည်း ပို့ပေးလို့ ရပါတယ်။ / role: သူ မရှိရင် ဝန်ထမ်းကလည်း ပို့ပေးလို့ ရပါတယ်။ — brief draft (brief-m1.md:126). ဝန်ထမ်း is the shipped diner word for staff (cart.ts:103).
- ဝန်ထမ်းကို ဒါလေး ပြလိုက်ပါ — a verbatim contiguous excerpt of the shipped `counterBody` MY (cart.ts:103, "…show this to the staff…"). It is flagged for K15: the imperative register differs from the app's "…မယ်" button convention.
- စုစုပေါင်း (cart.ts:93) · မုန့်ဟင်းခါး / အုန်းထမင်း (catalog name_my)
- No Burmese, listed: "Let them know", "They can see you're waiting."

### A11Y

- **Landmarks and names.** The block is `<section aria-labelledby="wait-h">`, and its h2 holds both languages (the MY span `lang="my"`). The avatar, ring and receipt disc are aria-hidden, because the sentences carry the meaning. Never colour alone: the state is the words.
- **Controls, in focus order:** Total door (50px), then "Let Aye know" (44px), then "Show a server" (58px).
  - "Show a server" carries `aria-haspopup="dialog"` and `aria-describedby="wait-staff"`.
  - Each control's visible text leads its accessible name (label-in-name).
- **One live region.** Checkout's existing `<p role="status">`. The block is NOT live, because draft and kitchen changes are ambient. The region speaks only the nudge failure and, once, the observed sent edge.
- **Focus.** When "Let Aye know" unmounts, focus lands on its replacement paragraph (`tabindex="-1"`), so the screen reader reads the confirmation. Focus is never dropped to body. When the block unmounts on the sent edge, focus inside it moves to the Total door.
- **Type and contrast.** Burmese is ≥13px, Padauk 400/700 only, `font-synthesis: none`, lh 1.6. Measured contrast:
  - #6e6358 on #faf9f5: 5.55:1
  - #726859 on #faf9f5: 5.19:1
  - #a65f10 link at 14px/700: 4.67:1
  - #fffdf8 on #a65f10: 4.84:1
  - ring glyph: 5.55:1 against the 3:1 non-text bar

---

## SCREEN picked-m1-2.dc.html — Show a server: the table's ticket, held up for Dad

**Device:** phone 390×844. **Theme:** light. Night is described at the end of the screen.
**Who and when:** Thiri tapped "Show a server". A full-screen modal dialog covers the header and the tab bar. She holds it up, or carries it to the counter, for Dad, who reads it from arm's length. He then presses the console Send he already has (staff.ts:2724-2727).

### LAYOUT (frame coordinates)

- **Ground** #faf9f5 edge to edge. No AppHeader, no tab bar, no scrim edge.
- **0–47** empty ground (safe area).
- **59–103 top line**, centred, min-height 44. This line is for the holder.
  - A 14px receipt glyph (stroke #726859), then "SHOW A SERVER" in 11px 700, letter-spacing 0.13em, uppercase, #726859.
  - Beneath it, 'ဝန်ထမ်းကို ဒါလေး ပြလိုက်ပါ' in 13px Padauk 400, #726859, `lang="my"`.
  - This echoes the button that opened the card, so the object is continuous.
- **The content stack is vertically centred** between 103 and 738. When it does not fit (a long list, or 200% zoom), it top-anchors and the middle scrolls; Done stays pinned. Drawn centred:
  - **223–295 "Table 7"** in Fraunces 72px 700, lh 1.0, letter-spacing -0.02em, #1b1714, tabular, centred. `<h1 id="card-table" tabindex="-1">`.
  - **299–357 'စားပွဲ 7'** in Padauk 36px 700, lh 1.6, **#1b1714 (full ink, for Dad)**, centred. The "7" is a Latin digit in a Hanken `lang="en"` span with `class="tn"`.
  - **381–433 the status capsule**, `<p id="card-status" role="status" aria-atomic="true">`.
    - inline-flex, centred, min-height 52, padding 0 22px, radius 999, #f2efe7, 1px rgba(58,35,23,0.1) border.
    - A hollow ring glyph 20px (circle r8, stroke 2.5px #6e6358, no fill, aria-hidden), then gap 10.
    - "Not sent yet" in 19px 800, #1b1714. Then "·" with margins 0 8px, #6e6358, aria-hidden. Then 'မပို့ရသေး' in Padauk 19px 700, #1b1714.
  - **457–618 the ticket**: a list card at x 20–370.
    - Card: #fffdf8, radius 20, 1px rgba(58,35,23,0.1) border, shadow `0 1px 0 rgba(255,255,255,0.55) inset, 0 1px 2px rgba(35,24,16,0.06), 0 8px 24px -12px rgba(35,24,16,0.18)`. Padding 4px 18px.
    - List: `<ul role="list" aria-labelledby="card-status">`.
    - Each row: min-height 76, padding 10px 0, flex, align-items centre, gap 14. Rows after the first carry a 1px rgba(58,35,23,0.1) top hairline.
    - **Row 1:**
      - Qty token 44×44, radius 10, fill #a65f10, numeral "2" in 22px 800 tabular #fffdf8, aria-hidden. A multiple wears the accent fill, as on the KDS.
      - Names: "Mohinga" in 21px 700, lh 1.3, #1b1714, preceded by a sr-only "2 ". Beneath, 'မုန့်ဟင်းခါး' in Padauk 19px 700, lh 1.6, #1b1714.
    - **Row 2:**
      - Qty token 44×44, radius 10, transparent with `inset 0 0 0 2px rgba(58,35,23,0.1)`, numeral "1" in #1b1714. A single is a ringed numeral.
      - Names: "Coconut Rice" / 'အုန်းထမင်း'.
- **754–810 Done**, the dialog's only control, pinned. x 20–370, min-height 56, radius 999, #fffdf8, 1px rgba(58,35,23,0.1) border, shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 2px rgba(35,24,16,0.06)`.
  - Label: "Done" 16px 700 #1b1714, "·" #6e6358 aria-hidden, 'ပြီးပါပြီ' Padauk 15px 700.
  - It is a paper secondary, not a filled pill, so nothing on the card competes with "Table 7" for Dad's eye.
- **810–844** empty (home inset).

### STATES (described, not drawn)

- **The order goes** (THE delight). The trigger is an observed draft→fired edge in /cart's applied views. It may be Dad's console Send or Aye's.
  - The capsule turns #eaf2ec, borderless.
  - The ring becomes a **solid 20px #346e47 disc with a 12px #fffdf8 check**, with one `mms-pop`.
  - The words become "Sent to kitchen · ပို့ပြီး".
  - The rows stay: the ticket now shows what was sent.
  - From the counter, Dad sees his own Send land in the guest's hand.
  - If the host undoes inside the 10 s grace, the capsule silently returns to "Not sent yet · မပို့ရသေး".
- **A tablemate adds or changes a dish while the card is up.** The list follows the confirmed view, and a new row rises in. The card never shows an unconfirmed line.
- **Every waiting dish is removed** (not a send). The card closes itself and focus lands on the Order page's h1. A removal never reads as a send.
- **No table number yet** (the table is bound at Send, §33). The identity block shows "Table code" (11px 800, 0.13em, uppercase, #726859) over the code (44px 800, 0.13em, tabular), which is InviteSheet's style (`InviteSheet.tsx:82`). The floor labels the session by the same code (`floor.ts:505`).
- **Lines this card never shows:** to-go drafts (they fire at pay, `checkout-stage.ts:82-88`), fired lines, prices, a total, owner names, minutes and any headcount. There are no counts on a shared cart. The qty token is the dish itself ("2 Mohinga"), as on every line card.
- **Night:**
  - ground #100c19; ticket #2b213c; capsule #211a30
  - text #f3ecdf (16.42:1); MY #f3ecdf
  - multiple token #e7a53a with #130d1e (8.91:1); single token ring rgba(243,236,223,0.13)
  - sent disc #5fb07e (7.35:1)
- **Reduced motion:** no `mms-pop` on the flip and no rise on new rows. Swaps are instant. There is no Turn and no swipe in v1.

### COPY (English)

- Show a server (the same words as the button)
- Table 7 (`floor.table` "Table {id}", staff.ts:402: the console's own pair)
- Not sent yet (staff.ts:2909) → on the edge: Sent to kitchen (`DINER_STATE_COPY.fired`, line-state-copy.ts:14)
- Mohinga · Coconut Rice: catalog names verbatim (`CartItem.name`, cart.ts:740-764). The quantity is the token, with a sr-only "2 " giving "2 Mohinga", never "2 ×" (add-feedback.ts:73-76).
- Done (kiosk/strings.ts:84)
- Unbound: "Table code" (InviteSheet.tsx:82) + the session code

### COPY (Burmese)

- ဝန်ထမ်းကို ဒါလေး ပြလိုက်ပါ — excerpt of shipped cart.ts:103 (as on screen 1)
- စားပွဲ 7 — shipped staff pair (staff.ts:402)
- မပို့ရသေး — shipped console word (staff.ts:2909)
- ပို့ပြီး — shipped console word for a sent line, K15-HIGH (staff.ts:2803 `table.line.state.fired`)
- မုန့်ဟင်းခါး / အုန်းထမင်း — catalog `name_my` (`CartItem.nameMy`, cart.ts:764)
- ပြီးပါပြီ — shipped (kiosk/strings.ts:84)
- **Zero new Burmese on this card.**

### A11Y

- **Dialog.** Radix Dialog, the Sheet's base primitive (packages/ui/src/sheet.tsx:2), as a full-screen variant. `role="dialog"`, `aria-modal="true"`, `aria-labelledby="card-table"`, `aria-describedby="card-status"`. Focus is trapped, Esc closes, and the page behind is inert.
- **Focus.** On open, focus lands on the h1 "Table 7". Done is the only control, 56px. On close, focus returns to "Show a server", or to the Total door if the wait block unmounted while the card was up.
- **One live region:** the status capsule. It is silent on open (a role=status only speaks changes) and says the flip once. Checkout's own region is outside the modal and sits under `aria-hidden`, so it is not used here.
- **List.** Named by the status. Each row reads "2 Mohinga, မုန့်ဟင်းခါး" (the MY span is `lang="my"`). Tokens and glyphs are aria-hidden. Never colour alone: a ring vs a disc, plus the words.
- **Zoom.** Text never shrinks. At 200% the middle scrolls and Done stays pinned.
- **Measured contrast:** #1b1714 on #f2efe7 15.5:1 · #726859 on #faf9f5 5.19:1 · #fffdf8 on #a65f10 4.84:1 at 22px 800 · sent disc #346e47 on #faf9f5 5.75:1.

---

## SCREEN picked-m1-3.dc.html — Aye's phone: Thiri is waiting, and the Send that says what happens next

**Device:** phone 390×844. **Theme:** light. Night is described at the end of the screen.
**Who and when:** Aye, the host, opens /cart Order stage seconds after Thiri tapped "Let Aye know". Nothing interrupted Aye: no sound, no toast, no sheet. The quiet line waited where the Send is. The frame is **scrolled to the end of the page** (scrollY 91). It is the pre-tap state.

### LAYOUT (frame coordinates, scrollY 91)

- **0–103 AppHeader, sticky.** The safe area is 0–47 and the header row 47–103, as on screen 1. The masthead ("Table 7" eyebrow, "Your order" + 'သင့်အော်ဒါ') is scrolled under it.
- **116–140 step rail** (`checkout-steps.ts:41-45`), drawn as m1-guided-2 draws it:
  - "1 Order" is current: a 20px #a65f10 disc with a #fffdf8 "1", and the label in #8f5009 12px 700.
  - "2 Bill" and "3 Pay" are next: ringed, #726859.
- **142–186 "← Browse the menu"**, `.nav-link`, 14px 700 #a65f10, followed by 'ထပ်မှာမယ်' (cart.ts:80). The Burmese is drawn at **13px** Padauk #726859, raised from the shipped 11px `--fs-xs` (Checkout.tsx:3012) to the 13px Burmese floor.
- **194–317 line card 1**, Thiri's draft. The host may edit any line (authz.ts:138).
  - "Mohinga", 'မုန့်ဟင်းခါး', owner Avatar sm 'T' #6e4070 + "Thiri", "$28.00".
  - Right column: stepper − 2 + (44px) over ⋯ (44px).
- **325–448 line card 2**, Aye's own: "Coconut Rice", 'အုန်းထမင်း', Avatar 'A' #1f6e63 + "You", "$3.50", stepper − 1 + over ⋯.
- **462–512 Total door**, quiet form, as on screen 1: "Total" + 'စုစုပေါင်း' and "$31.50 →". **No door note.**
- **528–568 THE NUDGE LINE**, `<p id="nudge-line">`.
  - A flex row, gap 10, x 20–370.
  - Avatar sm 22px 'T' #6e4070 with a white 10px 800 initial, top-aligned at y 529, aria-hidden. The avatar IS the signal, so there is no bell glyph (a bell implies sound).
  - Text, EN: "Thiri is waiting on this send." in 13px 600, lh 1.45, #1b1714 (528–547).
  - Text, MY: 13px Padauk 400, #6e6358 (547–568). "Thiri" sits in a `lang="en"` span.
  - No container, no fill, no icon, no motion once arrived. It is quiet, silent and non-blocking (owner answer 3).
- **580–638 SEND, the hero** (`.checkout-cta`).
  - x 20–370, min-height 58, radius 12.
  - Background linear-gradient(180deg, #a65f10, #8f5009), shadow as on screen 1.
  - Centred stack: "Send to kitchen · 3 items" in 16px 800 #fffdf8 (the "3" tabular), then 'မီးဖိုချောင်ဆီ ပို့လိုက်မယ် · 3 ခု' in 13px Padauk 700 #fffdf8.
  - `aria-describedby="nudge-line send-caption"`.
- **646–686 THE CAPTION**, `<p id="send-caption">`, centred: EN 13px #6e6358, lh 1.45; then MY 13px Padauk 400 #726859.
  - It is shown BEFORE the tap as feedforward ("a mistake here is recoverable"), and it stays in place, same node and same id, when Send becomes Undo. The tap therefore causes no layout shift.
- **694–710** Checkout's status region. Empty.
- **750–844** tab bar, **Order** current.

### STATES (described, not drawn)

- **The tap.** One tap sends: `sendToKitchen`, host-only on the server (cart.ts:282), 10 s grace.
  - The same 58px box relabels in place into the **outline Undo**: `.checkout-outline-btn` with `.mms-settle`, #fffdf8, a 1.5px #a65f10 border, #8f5009 ink.
  - Line 1: "Undo" 16px 800, with " — 9s" in an **aria-hidden leaf**.
  - Line 2: 'ပြန်ယူ' in 13px Padauk 700 (staff.ts:2705, K15-HIGH). This makes the diner Undo bilingual with a shipped word.
  - The box keeps min-height 58, so the caption never moves.
  - For 350 ms after the relabel, taps on the new control are ignored (`undoTapHeld`, send-grace.ts:51). The second half of a double-tap lands on nothing, which closes P2y. The same hold applies to Undo → Send.
  - Focus parks on Undo (the existing grace hook, `useUndoGrace.ts:235`).
  - The paper-beat receipt glyph lifts off, as shipped.
  - The one region says the shipped `sentCopy`: "Sent to the kitchen — 3 items on the way." with 'Kitchen သို့ မှာယူရန် အတည်ပြုပါပြီ' (confirm-copy.ts:66-71; confirm.ts:22; delivered at SendToKitchenButton.tsx:134-135).
  - The `chime("sent")` stays opt-in only (§15). The guest's phone never makes a sound.
  - **The nudge line leaves** in place (`.mms-remove`; reduced motion makes it instant). This phone's own view now has no drafts, so the request is answered. It holds nothing focusable, so no focus is orphaned.
- **Undo inside the window.** "Bringing it back…" (SendToKitchenButton.tsx:205), then Send returns. The nudge does not come back, because Thiri's flag cleared on her sent edge (one per round). She can nudge again; her button returns with the drafts.
- **Two or more guests waiting, or the waiter is unnamed** (`chosenName` → null). The line reads "Someone's waiting" with its MY. The waiting seats show as an Avatar sm stack (22px, −6 overlap); the group's `aria-label` lists the names. There is no count.
- **Aye is on /menu when the nudge lands.** The order bar's second line reads "Someone's waiting · တစ်ယောက် စောင့်နေပါတယ်" where it otherwise reads "Not sent yet · မပို့ရသေး". It is not live; it joins the bar's static `aria-label`. No toast, no sound.
- **Aye still has the default name and the party has just grown to two** (graft 3: the name asked once, when it starts to matter).
  - One inline row sits above the nudge line:
    - the question with its reason line
    - a 52px field (#efece2, radius 12, 16px, placeholder "Your name", maxlength 40, `autocomplete="given-name"`, the same Zod bound as InviteSheet, schemas.ts:17)
    - a "Save" primary pill (52px, EN over MY)
    - a 44px "Not now" text button
  - On Save, focus moves to Send, and "Name saved" is spoken once.
  - Not now hides it for the visit (sessionStorage behind try/catch).
  - It never appears once a name is chosen. It is not drawn here because Aye is named.
- **A peer pay lock.** The shipped lock line leads. Send is `aria-disabled` at 0.55 with `FROZEN_NOTE` (shipped). The nudge line stays, because Thiri is still waiting.
- **Night:**
  - ground #100c19; text #f3ecdf; --t2 #bcafc8; --t3 #a69eb1
  - Send flat #e7a53a with #130d1e ink (8.91:1)
  - Undo: border #e7a53a, ink #e7a53a, on #2b213c
  - avatar hues unchanged (PCOL, `lib/avatars.ts:4`)
- **Reduced motion:** the nudge line appears without `.mms-rise`. No `.mms-settle` and no paper beat (shipped RM gates). The 350 ms hold still applies.

### COPY (English)

- Thiri is waiting on this send. Unnamed or several waiting: "Someone's waiting" (quiet owner-prototype drafts)
- Send to kitchen · 3 items (cart.ts:40,61-62 via SendToKitchenButton.tsx:236-238)
- The kitchen sees it when the countdown ends. (guided draft; true per counter-order.ts:221-225)
- On the tap: Undo — 9s (SendToKitchenButton.tsx:283) · Bringing it back… (:205)
- Spoken on success: "Sent to the kitchen — 3 items on the way." (confirm-copy.ts:68)
- Total · $31.50 · "← Browse the menu" (menu-href.ts:48) · owner rows "Thiri" / "You"
- On /menu: "Someone's waiting" (bar line 2)
- Name ask (state; guided drafts):
  - What should your table call you?
  - Your table sees you as the one who sends.
  - Your name
  - Save
  - Not now
  - Name saved
  - Couldn't save your name — please try again.

### COPY (Burmese)

- Thiri က ဒီအော်ဒါ ပို့တာကို စောင့်နေပါတယ် — brief draft (m1.json, quiet screen 6)
- တစ်ယောက် စောင့်နေပါတယ် — brief draft (m1.json, quiet screen 6)
- မီးဖိုချောင်ဆီ ပို့လိုက်မယ် · 3 ခု — shipped (cart.ts:40,62)
- အချိန်ကုန်တာနဲ့ မီးဖိုချောင်က မြင်ရပါမယ် — brief draft (brief-m1.md:254)
- ပြန်ယူ — shipped staff Undo, K15-HIGH (staff.ts:2705)
- Kitchen သို့ မှာယူရန် အတည်ပြုပါပြီ — owner verbatim (confirm.ts:22)
- စုစုပေါင်း (cart.ts:93) · ထပ်မှာမယ် (cart.ts:80) · မုန့်ဟင်းခါး / အုန်းထမင်း (catalog)
- Name ask (state), all guided brief drafts (m1.json, guided screens 2 and 4):
  - စားပွဲက သင့်ကို ဘယ်လို ခေါ်ရမလဲ?
  - စားပွဲက သင့်ကို အော်ဒါပို့ပေးမယ့်သူအဖြစ် မြင်ရပါမယ်
  - သင့်နာမည်
  - သိမ်းမယ်
  - နောက်မှ
  - နာမည် သိမ်းပြီးပါပြီ
  - နာမည် မသိမ်းနိုင်သေးပါ — ထပ်ကြိုးစားပါ

### A11Y

- **The nudge line** is plain text, not live: quiet means no interruption. Equal access comes from Send's description. A screen-reader host focusing Send hears "Send to kitchen, 3 items. Thiri is waiting on this send. The kitchen sees it when the countdown ends." That is the point of action, exactly where a sighted host reads it. No sound, no haptic.
- **Send:** its name is the visible label (EN + MY, `lang="my"` on the MY span), and it is 58px.
- **Undo:** its name is "Undo" alone, and it is `aria-describedby="send-caption"`, the visible caption. This closes P2as for everyone, not only screen-reader users. The changing count is aria-hidden, so the name does not change every second.
- **One live region:** Checkout's existing status `<p>`. It carries only `sentCopy`, the undo outcome and refusals.
- **Focus:** it parks on Undo when the window opens. The nudge line and the name row hold nothing that can be orphaned. After Save, focus goes to Send.
- **Targets:** stepper, ⋯ and nav-link 44 · Send/Undo 58 · Total door 50.
- **Measured contrast:** #1b1714 13px/600 on #faf9f5 · #6e6358 5.55:1 · #726859 5.19:1 · #fffdf8 on #a65f10 4.84:1.

---

## DECISIONS

1. **Guided is the backbone.** Every diner sentence in the moment answers "what happens next, and who does it". The host is named from `session_members` (split.ts:85-98), never from presence. (Owner answer 1.)
2. **The three-stop path is dropped.** It becomes one "Next:" sentence, and the shipped Order·Bill·Pay rail stays the only step vocabulary. (This fixes the judged "second step vocabulary".)
3. **No card above the food on /menu.** The menu half of the moment is quiet's bar line only: "Not sent yet · မပို့ရသေး" on the order bar's second line. (§21; graft from quiet.)
4. **No counts on the shared cart.** The "N items not sent yet" door note goes (Checkout.tsx:3944-3948). The card has no headcount, total or minutes; only the per-dish qty token. (Standing rule; judges' note on guided.)
5. **One family word.** "Not sent yet · မပို့ရသေး" (staff.ts:2909) heads the wait block, the card and the bar, so the guest's phone and Dad's console say the same two words. (Quiet graft; judges' reasoning.)
6. **"Show a server" is the one primary.** It always works and needs no transport or presence. "Let Aye know" is a quiet text-button secondary, offered only while Aye's phone is on the table channel. (Owner answer 3: a "big" card and a "quiet" nudge; one hero verb per state.)
7. **The guest's hero changes while waiting.** It moves from the filled "View bill" door (D13) to "Show a server". The Total door stays a quiet, always-open door (reading is not a write). This needs a 'wait' arm in `orderStageHero`, with mutants. (§32.)
8. **The card is the table's ticket.** "Table 7" over 'စားပွဲ 7' (staff.ts:402), the console word, dishes with the KDS qty tokens (kds-line.ts:121; globals.css:8050-8069), and Done. There is no ask sentence, no minutes and no Turn. (Owner answer 3; graft 1; quiet's restraint; KDS grammar.)
9. **Card hierarchy.** It is English-leading, as the owner worded it ("Table 7 over စားပွဲ 7"). Every Burmese line on it is full ink, near the English size, because its reader is Dad. (Owner answer 3; bilingual rule.)
10. **The one delight.** The card's capsule flips from a hollow ring to a solid disc, "Sent to kitchen · ပို့ပြီး", on the observed draft→fired edge, so Dad sees his own Send land. (Glanceable graft; graft 1's last sentence; graft 5's shape before colour.)
11. **The nudge rides the table's private, member-gated presence channel** (qr_platform_init.sql:248-256) as a `waiting` flag. No row, no DDL, no staff signal, no sound, no toast. /cart joins the channel. (Owner answer 3; quiet screen 6's mechanism.)
12. **The nudge is honest.** It is offered, and "Aye can see you're waiting" is shown, only while Aye's seat is present. It is one per draft round and clears itself on the send edge or when the phone leaves. (Honesty: copy promises only what the code keeps.)
13. **Aye's side is a line, not a notification.** Thiri's avatar sits beside one quiet sentence above Send, carried in Send's description, and it leaves when Aye sends. On /menu, the bar line becomes "Someone's waiting". (Owner answer 3: "quiet, silent, non-blocking".)
14. **The countdown caption stays.** "The kitchen sees it when the countdown ends." sits under Send AND Undo, as feedforward, with no layout shift. Undo is `aria-describedby` it. (Guided graft 2; true per counter-order.ts:221-225.)
15. **The Undo hardens.** Its name is "Undo", with the count in an aria-hidden leaf (the staff pattern, staff.ts:2703-2706), a shipped MY 'ပြန်ယူ', and the 350 ms `undoTapHeld`. This closes P2y and P2as. (Brief; guided graft 2.)
16. **The name is asked once, at the moment it matters.** On the host's /cart, when the party first reaches two under the default name, and never as a card on /menu. One `chosenName()` predicate means "Guest" is never rendered as a person. (Graft 3.)
17. **One word for staff:** ဝန်ထမ်း throughout (cart.ts:103), never a second word (စားပွဲထိုး). The button's Burmese is an excerpt of a shipped string, not a new draft. (Fewer new Burmese strings.)
18. **Both ways forward hide under a tablemate's pay lock.** Staff can't send then either (staff-send-view.ts:164). The shipped lock line stays the one lock sentence. (T37; honesty.)
19. **Host-only Send, the 10 s server grace, and amounts stay exactly as they are.** No money path changes. (Binding rules; owner answer 3: "host-only Send stays enforced on the server".)
20. **New Burmese strings are cut from about 25 (the guided concept) to 8.**
    - Seven come from the briefs' drafts: the four quiet drafts (Let Aye know, its confirmation, the host's line, the bar line), the staff sentence, the countdown caption, and the "Next" prefix. The prefix is composed with a shipped sentence.
    - One is an excerpt of a shipped string.
    - The name-ask state reuses seven guided drafts.
    - Everything else is shipped. (Owner: "far fewer new Burmese strings".)

## OPEN RISKS

1. **Ownership.** CartBar.tsx (and ArrivalBeat) are unowned this wave. The /menu half (guest "Not sent yet", host "Someone's waiting") needs an owner assignment, or it waits a wave. The three drawn screens are all /cart and ship with diner-cart.
2. **Presence is client-asserted.** A co-member could fake the host's presence key or a `waiting` flag. The worst outcome is a misleading "Aye can see you're waiting" or a spurious "Someone's waiting". It is harmless, and names on /cart come from `session_members`, not the payload.
3. **iOS sockets.** Backgrounding drops the socket, so "Let Aye know" disappears while Aye's phone sleeps, and the confirmation hides if Aye leaves. That is honest by design, but it may feel flaky. Watch it in the pilot.
4. **/cart joining presence is new plumbing.** It needs `SplitContext.sessionId` and must key by seat to avoid ghosts (LEARNINGS #4). The waiting flag must ride both /menu's provider and /cart, held for the round in sessionStorage.
5. **"Show a server" still depends on a person noticing.** There is no diner→staff signal (P2dt), and the floor does not count a diner's own drafts on a host table (staff-send-view.ts:189-196 `staffOwedSendUnits` at :194). The card is the substitute, not a fix.
6. **Burmese needs the K15 · diner-cart native pass.**
   - 'ဝန်ထမ်းကို ဒါလေး ပြလိုက်ပါ' is imperative on a button, where the convention is "…မယ်".
   - 'နောက်တစ်ဆင့် — ' plus the shipped sentence is a composition.
   - Every quiet and guided draft used here still needs the pass.
   - If any is refused, that string ships English-only.
7. **The Send label "· 3 items" is the one count left on the shared cart.** It is the owner's W16b example, read from the confirmed view, and can be a tap stale. `sentCopy` then reports the true fired count.
8. **The 'wait' arm in `orderStageHero` reverses D13** (guest → bill hero). It needs a PHASE3C_DESIGN / DESIGN-LANGUAGE §32 amendment and new mutants in checkout-verb.ts, a verify:slice module.
9. **A table with no number yet** (bound at Send) gets a "Table code" plus code card. That matches the floor label, but a code is harder to read at distance than a number, and "Table code" has no Burmese.
10. **No wake lock.** The screen may dim while held up. A wake lock is deliberately not claimed. The Night card (light on dark) is untested at distance in a dim room.
11. **"Sent to kitchen" flips at the fire, while the 10 s grace is still open.** An Undo flips it back. That is an honest mirror, but it can read as a flicker.
12. **The pre-tap caption names a countdown before one exists.** If pilot hosts find it confusing, show it only from the Undo state. The string is unchanged.
13. **Scroll.** With two line cards, the guest's actions sit below the fold at scroll 0; only the status and "Next:" are above it. Measure on 375×667 and at 320px before merging.
14. **Several waiting guests collapse into "Someone's waiting"** with an avatar stack. Names appear only in the group's accessible label.
15. **The name-ask row and the nudge line can stack above Send at once** on a default-named host's phone. That is busy but rare: only once, on the first growth to two.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

1. Drop the new 'Next:' label and its composed MY prefix 'နောက်တစ်ဆင့် —'. Row B becomes the shipped hostSendsCopy pair verbatim; actor-first is the guide grammar, and the avatar lead stays as the 'who' mark. This removes one composed Burmese draft (new MY goes from 8 to 7) and matches m2/m3/m4, none of which carries a label.
2. The Show-a-server card becomes the shared CounterPass, the same object as m2's pass. Identity stub: 'Table' at --fs-h2 and the numeral at --fs-pass (88px), replacing the 72px literal. 'စားပွဲ 7' is full ink at --fs-display, replacing the 36px literal. A 2px DOTTED perforation with 12px notches separates the identity from the body (the status capsule and dish rows). The pass is constant paper (--on-ink ground, --ink text) in both themes, following m4's tag rule; only the page around it follows Night. This also closes open risk 10.
3. The card's flip to 'Sent to kitchen · ပို့ပြီး' waits until the server view shows the lines past their 10 s grace (one re-read scheduled at the grace's end, still observed, never a client clock). The past tense is then true, and the card turns green at the same moment Mom's KDS flashes the ticket. This closes risk 11's flicker.
4. Undo: the MY is ပြန်ဖျက် (kds.undo), not ပြန်ယူ, which is the KDS's 'Bring back'. The outline Undo takes the one undo posture: --sf fill with a 1.5px DASHED --ac edge, shared with m3 and the counter lane. The name stays 'Undo', with ' — 9s' as an aria-hidden leaf and the 350 ms undoTapHeld.
5. On a dine-in (shared) cart the Send label drops the count: 'Send to kitchen' / 'မီးဖိုချောင်ဆီ ပို့လိုက်မယ်', both substrings of shipped strings. sentCopy may still report the server's fired count after the fact. This closes risk 7 under the no-count-on-a-shared-cart rule.
6. Owner answer 3: offer 'Let Aye know' whenever the host is named. Do NOT gate it on Aye's presence: a face-down phone is the common case. The waiting flag rides Thiri's own presence entry (plus sessionStorage), so Aye's phone shows the quiet line the moment it joins. After the tap the button settles into a pressed state (aria-pressed) that makes no claim. 'Aye can see you're waiting.' shows only while Aye's seat is present.
7. Hostless state: while SURFACES.dineInPhonePay is false, the Total door reads 'View bill', never 'View bill & pay' (owner answer 2). Drafts go with the counter ask and settle exactly as m2 specifies.
8. Handoff to counter-floor, so the card and the console match by shape and word: Dad's pane groups the waiting dishes under the same hollow ring and 'မပို့ရသေး · Not sent yet' (pad.group.unsent). The floor's owed-Send corner dot becomes that hollow ring in --warn ink, and the strip key decodes it as '○ မပို့ရသေး'.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **Amendment 1 is not applied: the 'Next:' label and its composed Burmese prefix are still there, and the new-Burmese tally is still 8.**
   - Evidence: picked-m1.md:87 ('"Next:" is weight 800 in #8f5009'), :137-139 ('"Next:" is new'), :151-154 ('နောက်တစ်ဆင့် —' prefix, composed per brief-m1.md:218-220), :57 and :423 ('the "Next:" sentence'), DECISION 2 (:381 'one "Next:" sentence'), DECISION 20 (:399-400 counts 8, including 'the "Next" prefix'). The amendment says row B is the shipped hostSendsCopy verbatim (confirm-copy.ts:119-122) and new MY drops from 8 to 7.
   - Fix: Row B becomes the bare hostSendsCopy pair (named branch confirm-copy.ts:120/122, role branch :121/122), with the 30px avatar as the only 'who' lead. Delete the #8f5009 'Next:' run and the prefix from COPY (Burmese), rewrite DECISION 2 as 'one actor-first sentence' (no label), and restate DECISION 20 as 7 new MY strings.
2. **Amendment 2 is not applied: the Show-a-server card is not the shared CounterPass. It uses 72px and 36px literals, has no dotted perforation, and is a dark card in Night. The Night sent disc would also fail non-text contrast once the pass is constant paper.**
   - Evidence: picked-m1.md:193 ('Table 7' Fraunces 72px), :194 ('စားပွဲ 7' Padauk 36px), :199-208 (one undivided list card, no stub or perforation), Night :228-231 (ticket #2b213c, capsule #211a30, sent disc #5fb07e). Open risk 10 (:420) is still listed. m2 defines the primitive (picked-m2.md:338-339, --fs-pass 5.5rem). Measured: #5fb07e on paper #fffdf8 is 2.58:1 and on #eaf2ec is 2.30:1, both under the 3:1 non-text bar. --fs-pass does not exist in tokens.css today. --fs-display is tokens.css:38.
   - Fix: Rebuild screen 2 as CounterPass. Identity stub: 'Table' at --fs-h2 plus the numeral at --fs-pass (88px), both inside the h1#card-table, and 'စားပွဲ 7' at --fs-display in full ink. A 2px DOTTED perforation with 12px notches (aria-hidden) sits between the stub and the body (capsule plus dish rows). Ground --on-ink and text --ink in BOTH themes; only the page around it goes Night. Replace the Night values with paper values: the multiple token stays #a65f10 with #fffdf8, and the sent disc stays #346e47 (5.31:1 on #eaf2ec). Close risk 10.
3. **Amendment 3 is not applied: the card flips to the past tense 'Sent to kitchen · ပို့ပြီး' on the fire edge, inside the 10 s grace, while Mom's KDS still hides the lines and the host can still undo. That is a promise the code does not keep.**
   - Evidence: picked-m1.md:216 ('trigger is an observed draft→fired edge'), :222 ('If the host undoes inside the 10 s grace, the capsule silently returns'), DECISION 10 (:389), open risk 11 (:421 'flips at the fire, while the 10 s grace is still open'). The KDS hides dine-in lines while fire_at > now: counter-order.ts:221-225 (kdsLineGate) and kitchen.ts:98-99. The grace is 10 s: 20260624030000_s4_money_remediation.sql:92 and 20260622050000_undo_grace.sql:23. CartItem carries fireAt (cart.ts:749).
   - Fix: Flip only when an applied server view shows the lines' fireAt in the past. Schedule ONE re-read at the grace end, and the flip still waits for that observed view; no client clock decides it. Until then the capsule stays 'Not sent yet · မပို့ရသေး'. The green disc and its one mms-pop land at the same moment the KDS shows the ticket. Remove the silent-revert sentence and close risk 11.
4. **Screen 1 announces 'Your order's with the kitchen.' on the fire edge, inside the grace. An undo then silently restores the wait block, so the guest is left holding a false statement with nothing to correct it. This breaks the system rule that tense follows the server and the past tense comes only after the window.**
   - Evidence: picked-m1.md:123-127: the block unmounts on the draft→fired edge, the region says 'Your order's with the kitchen.' once (cart.ts:57-60), and 'If the host undoes inside the 10 s grace, the block simply returns, with no announcement.' The KDS hides lines in grace (counter-order.ts:221-225). Amendment 3 moves the card to the past-grace view, so screen 1 and the card would now disagree about the same fact.
   - Fix: Key screen 1's unmount and its single announcement to the same past-grace observed view as the card. During the grace, keep the block and either leave its words as they are or use an '-ing' or future line from shipped or brief copy. Never speak the past tense until fireAt has passed in an applied view. An undo inside the grace then needs no correction, because nothing was claimed.
5. **Amendment 4 is not applied: the diner Undo uses ပြန်ယူ, which is the KDS 'Bring back' word, and a solid border on a paper fill instead of the one undo posture.**
   - Evidence: picked-m1.md:300 ('.checkout-outline-btn … #fffdf8, a 1.5px #a65f10 border'), :302 and :354 ('ပြန်ယူ' from staff.ts:2705), DECISION 15 (:394 'a shipped MY ပြန်ယူ'). ပြန်ယူ is kds.recall 'Bring back' (staff.ts:254). The amended word is kds.undo ပြန်ဖျက် (staff.ts:255). Measured: if the label ink drifted to --ac #a65f10 on --sf #f2efe7 it would be 4.28:1, which fails 4.5:1 at 16px 800.
   - Fix: Undo is the word 'Undo' over 'ပြန်ဖျက်' (kds.undo, staff.ts:255), with ' — 9s' as an aria-hidden leaf. Fill --sf with a 1.5px DASHED --ac edge, never filled and never the hero. Keep the label ink --ac-strong #8f5009 (5.51:1 on #f2efe7; Night #e7a53a on #211a30 is 7.84:1). Keep the 350 ms undoTapHeld (send-grace.ts:51). Update the COPY (Burmese) line and DECISION 15.
6. **Amendment 5 is not applied: the host's Send label still carries a count on a shared (dine-in) cart, both visibly and in the screen-reader name.**
   - Evidence: picked-m1.md:290 ('Send to kitchen · 3 items' and 'မီးဖိုချောင်ဆီ ပို့လိုက်မယ် · 3 ခု'), :333, :352, A11Y :368 ('hears "Send to kitchen, 3 items…"'), open risk 7 (:417 'the one count left on the shared cart'). The rule is DESIGN-LANGUAGE.md:1917-1919 (§21, never a count for a SHARED cart). The shipped count-free pair exists at i18n/cart.ts:40.
   - Fix: For dine-in, the label is exactly 'Send to kitchen' / 'မီးဖိုချောင်ဆီ ပို့လိုက်မယ်' (cart.ts:40), and the spoken Send name drops '3 items'. sentCopy (confirm-copy.ts:66-71) may still report the server's fired count after the fact. Close risk 7.
7. **Amendment 6 is not applied: 'Let Aye know' is only offered while Aye's phone is on the channel, and after the tap it is replaced by a paragraph. Because the flag clears when Thiri's own presence leaves, the sessionStorage hold is moot, and a face-down host phone (the common case) gets no nudge at all.**
   - Evidence: picked-m1.md:57 ('Aye's phone is open on the table channel, so the nudge is offered'), :109 ('Aye's phone is not on the table channel … Row B has no "Let Aye know"'), :112 ('The button is replaced in place by a static two-line paragraph'), :114 ('flag clears … when this phone's presence leaves'), DECISION 6 (:385 'offered only while Aye's phone is on the table channel'), DECISION 12 (:391).
   - Fix: Offer 'Let Aye know' whenever chosenName(host) is non-null, whatever Aye's presence. On tap, track {seat, name, waiting:true} on Thiri's own entry, persist it in sessionStorage (behind try/catch), and re-assert it on every channel join so Aye's phone shows the line the moment it joins. The flag clears on the past-grace send edge or when the table has no drafts, not when presence leaves. The button stays mounted and settles to aria-pressed='true' with a label that makes no claim. 'Aye can see you're waiting.' renders, unfocused and not live, only while Aye's seat is in presence.
8. **'Aye can see you're waiting.' is gated on presence, but presence is not the same as visibility. Aye's /menu joins presence (TableCartProvider.tsx:308-312), yet the /menu half that would draw the waiting line (CartBar row 2) is unowned this wave. On /menu, Thiri's phone would claim something Aye's screen does not show.**
   - Evidence: picked-m1.md:113 (the paragraph is shown while Aye's seat is in presence), :312 (Aye on /menu sees CartBar line 2 'Someone's waiting'), open risk 1 (:407 'CartBar.tsx … unowned … needs an owner assignment, or it waits a wave'), brief-m1.md:25. Presence is wired on /menu whenever isGroup (TableCartProvider.tsx:308).
   - Fix: Either ship the CartBar row-2 change in the same release as the guest confirmation, or have the host's presence entry advertise that its current surface renders the waiting line (for example, a sees flag set only by /cart, plus /menu once CartBar ships), and gate the confirmation on that flag instead of bare presence. Otherwise drop the confirmation until both host surfaces render the line.
9. **Owner answer 2 and amendment 7 are not applied: the hostless state's hero is 'View bill & pay', and the post-send Total door, which becomes the hero again with nothing blocking, would also read 'View bill & pay' under shipped billDoorLabel. Phone pay is off until C1.**
   - Evidence: picked-m1.md:122 ('The hero is the shipped Total door "View bill & pay", and pay fires the drafts'), :124 ('the Total door becomes the hero again (orderStageHero → bill)', with no label given). checkout-verb.ts:72-77: billDoorLabel returns 'viewBillAndPay' whenever block is null and there is no counter ask. A guest's graceOpen is device-local (checkout-verb.ts:52-62), so after the host's send the guest's door reads '& pay'. The SURFACES.dineInPhonePay flag is new (picked-m2.md:272-278).
   - Fix: State that while SURFACES.dineInPhonePay is false the Total door's name is 'View bill' / 'ဘောက်ချာ ကြည့်မယ်' (cart.ts:44) in EVERY arm, hostless and post-send included (billDoorLabel takes the flag; add a mutant). For a hostless table, the drafts go with the counter ask and settle exactly as picked-m2.md:144-151 specifies, not 'pay fires the drafts'.
10. **Amendment 8 is not applied: there is no counter-floor handoff, and the spec explicitly rejects reusing the floor mark. The card and Dad's console therefore do not match in shape.**

- Evidence: picked-m1.md:48 ('The floor's "not sent" mark could be reused on diner screens. | Rejected'). The floor still draws the solid 8px --warn dot (globals.css:14488-14497 .floor-owed-dot). DECISION 5 (:384) claims the phone and console say the same two words but specifies no console change. pad.group.unsent exists at staff.ts:2909.
- Fix: Add a handoff section for counter-floor. Dad's pane groups the waiting dishes under the hollow ring plus 'မပို့ရသေး · Not sent yet' (pad.group.unsent, Burmese-first). The floor's owed-Send corner dot becomes the same hollow ring in --warn ink, a mark tier with no fill. The strip key decodes it as a ring glyph (aria-hidden) plus 'မပို့ရသေး'. Replace the 'Rejected' row with this.

11. **There are two filled primaries in one state. The host's name-ask row draws a 'Save' primary pill above the filled Send hero on the same screen.**

- Evidence: picked-m1.md:313-320 (name-ask row with 'a "Save" primary pill (52px, EN over MY)') while :287-291 keeps Send as the filled .checkout-cta hero. Open risk 15 (:425) admits they stack. DESIGN-LANGUAGE.md §32 (:2411-2416 'exactly one filled .checkout-cta'), RULES.md:143 ('ONE primary per section').
- Fix: Make Save a paper secondary (.ui-btn-secondary: #fffdf8, 1px --bd, --tx ink, 52px). 'Not now' stays a 44px text button. Send remains the only filled control in that state.

12. **The spec edits the /menu order bar, adding row 2 and extending its static aria-label, but keeps the shipped dine-in count capsule and the '— N items' accessible name. Its own DECISION 4 says there are no counts on the shared cart.**

- Evidence: DECISION 3 (:382) and DECISION 13 (:392) change CartBar row 2. :312 says the line 'joins the bar's static aria-label'. The shipped bar renders the count capsule and a counted name in dine-in: CartBar.tsx:110 (aria-label 'View order — ${count} items…') and :138-139 (cartbar-cnt capsule). The quiet brief's composed label is 'View order, not sent yet — 3 items, subtotal $31.50' (brief-m1.md:87). The rule is DESIGN-LANGUAGE.md:1917-1919.
- Fix: In the /menu handoff, specify that on a dine-in (shared) cart the CartBar drops the cartbar-cnt capsule and its accessible name becomes 'View order, not sent yet — subtotal $X' (amount still '—' until confirmed). Pickup and the market keep their count.

13. **Several file:line citations are wrong, and one contrast figure was measured against the wrong ground.**

- Evidence: (a) checkout-steps.ts:41-45 (:272): the file has 42 lines; the rail labels are at :37-41. (b) cart.ts:279 'locked' (:35): :279 is the rate-limit check; 'if (locked)' is :280. (c) useUndoGrace.ts:235 'focus parks on Undo' (:305): :235 is the ref callback; the focus landing is :396-400. (d) checkout-stage.ts:82-88 'Send fires dine-in drafts only' (:45, :226): those lines are the pay gate's raw-row count (kitchenDraftUnitsFromRows); the fire's dine-in filter is 20260624030000_s4_money_remediation.sql:103. (e) The sent disc is given as '#346e47 on #faf9f5 5.75:1' (:260), but it sits on the #eaf2ec capsule, which measures 5.31:1 (it still passes).
- Fix: Correct the five citations as listed: checkout-steps.ts:37-41, cart.ts:280, useUndoGrace.ts:396-400, s4_money_remediation.sql:103, and the disc measured on #eaf2ec at 5.31:1.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- The system's 'one Undo word ပြန်ဖျက်' collides with a pinned owner choice. staff.ts:2698-2699 and autonyms.test.ts:186-197 assert that the console table page's Undo must NOT contain ဖျက် (the owner chose ပြန်ယူ so a server scanning for Void ဖျက် never lands on Undo). It is fine on the diner phone, where no ဖျက် verb sits nearby, but the same rule applied to the counter lane would turn that test red. Raise it with the owner before the console adopts ပြန်ဖျက်.
- The voice grammar puts the actor-first NEXT sentence directly above the hero it explains, with the human fallback last. On screen 1 the hero ('Show a server') is the fallback's action, and row B ('Aye sends…') sits two elements above it. Say explicitly that the hero belongs to the fallback by owner answer 3, or reorder so row C plus the hero read as the closing pair. Either way, make the grammar exception explicit.
- With the amendment applied, 'Let Aye know' becomes a one-way aria-pressed control. aria-pressed means a toggle, so either let it un-press (which clears the flag) or use aria-disabled with a label that makes no claim, so screen-reader users are not told it is a toggle that cannot be toggled.
- Unlisted English-only strings: the nudge-failure line reuses useUndoGrace's 'locked' reason (useUndoGrace.ts:166), which has no Burmese pair. Add it to the 'No Burmese, listed' set along with 'Table code'.
- The qty token's accent fill comes from KDS grammar (kds-line.ts:121), but the shared marks reserve 'ACCENT-FILLED disc or lit cap' for now/selected. Note that the radius-10 square qty token is the one KDS exception, so the vocabulary does not read as contradicted.
- The CounterPass unbound fallback ('Table code' plus the session code) needs the qr_code on /cart. SplitContext (split.ts:47-54) carries only tableNumber, so name that plumbing alongside sessionId. An alphanumeric code will not fit at --fs-pass, so keep the 44px code tier and say so.
- The :57 claim 'At scroll 0 the status heading and the "Next:" sentence already sit above the fold, at y 619–760' puts the sentence's bottom 10px under the tab bar (750). Re-measure after dropping the label.
- Dish rows on the pass are 21px EN and 19px MY, well below the KDS tier-S item (28px, MY 30px) Dad reads daily. Consider a larger row tier on the pass for across-the-counter reading, since the stub already uses --fs-pass.

### D · Round 3 (2026-10-07, under the owner's delegation) — these win over everything above

The owner delegated every open decision ("I trust you to apply world-class design-thinking best standards on
all open decisions") and added a live TV board, card / Apple Pay after the food is served, and animated step
guides. PATH_DESIGN_2026-10-07.md's round-3 section records the decisions (D1–D5) and the shared vocabulary.
The round-3 consistency pass gave this moment these changes:

1. D1(a) ownership: CartBar.tsx and components/menu/ArrivalBeat.tsx (the /menu half) are diner-cart's under a scoped unfreeze, and MenuBrowser.tsx stays frozen. Replace every 'no stream owns this wave' line, here and in PATH_DESIGN moment 1.
2. D3 Undo word: withdraw amendment 4 and fix B5.

- The guest's Send Undo keeps the shared form: its own slot, --sf, a 1.5px dashed --ac edge, an aria-hidden seconds leaf and the 350 ms guard.
- It reads 'Undo · ပြန်ယူ', and its busy state reads 'Bringing it back… · ပြန်ယူနေပါတယ်…'. Both are verbatim from table.send.undo and table.send.undoing (staff.ts:2705-2707).
- It is the same SendToKitchenButton control as m2's Bill.
- A red-first test pins the diner key's MY equal to STAFF['table.send.undo'].my.
- The 'Brought back to your order…' notes stay English-only.
- Restore DECISION 15.

3. The Sent flip is the track's first stamp, not a done mark.

- When the dishes pass kdsLineGate's grace (the same instant Mom's KDS and the TV draw them), the hollow ring gives way to the 1/3 track: segment 1 FILLs in --pass-ink-2, with 'Sent to kitchen · ပို့ပြီး'.
- Retire the solid green ✓ disc, the #eaf2ec capsule and the mms-pop. Green on a pass means Served, a ✓ marks only Paid, and the kit's 1.18 pop is for numerals.
- The Night sent-disc value is deleted, because the pass is constant paper.

4. Show-a-server is post-pay's CounterPass primitive.

- The two-tongue label 'စားပွဲ · Table' (the Burmese at full ink, --fs-h2) sits over ONE Fraunces 600 figure at --fs-pass.
- Retire the second figure line 'စားပွဲ 7' at --fs-display, so the number is printed once.
- Inks come from --pass-\*, and the notch holes from --pass-hole.
- The unbound table's code keeps the .exit-pass-code face at 40px (reconciliation 6).

5. D5, after C2 only: the Order stage's Total door reads 'View bill' while the kitchen hold is up, and 'View bill & pay' once the door opens. billDoorLabel reads payBlock's new kitchen arm, with precedence peer > unsent > kitchen > grace. Before C2, PD2's label is unchanged.
6. --fs-pass lands in guards-style's early token-only PR (D1(c)). PATH_DESIGN's pick of counter-floor for tokens.css is withdrawn.

### E · Codex round 3 (2026-10-08) — these win over everything above

1. **The nudge is durable.** "Let Aye know" writes a stamp on the cart (the nudger's seat and time) through a member-authorized server action, status-guarded in the SQL (cart open, a host named, the nudger not the host; at most once a minute); `mms_fire_cart` clears it in the same statement as the fire. A presence flag dies when the guest locks their phone (`useGroupCart` removes the channel on unmount, `lib/realtime.ts:90-93`), which is exactly the face-down-host case. The column pair is a migration riding PD1, applied on the owner's go; "Aye can see you're waiting" still shows only while the host's surface draws the line.
