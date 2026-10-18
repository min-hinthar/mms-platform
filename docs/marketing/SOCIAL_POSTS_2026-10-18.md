# Social posts — how to use the app (DRAFTS, 2026-10-18)

> **DRAFTS for the owner's review. Nothing here has been published.** Each post goes out only after
> Min reads it, clears every `[confirm …]` or `[publish only after …]` marker on it, and takes the
> screenshots from the real app. A post with a marker still on it is not ready.

## The rules these drafts follow

- **Every step is something the app does today** (checked against the code on `main`,
  2026-10-18). The button names are the ones on the screens.
- **No hours, wait times, prep times, prices, counts, discounts or promo codes.** The app has none of
  these to promise, so the posts don't either.
- **Card payments run on Stripe test keys until the live cutover (OPEN-ITEMS C2).** Any post that
  tells guests to pay by card on their phone carries
  **[publish only after the live-payments cutover (C2)]**. No post names Apple Pay or Google Pay.
- **Dine-in guests pay at the counter.** Paying for a table on the phone is switched off until after
  the cutover, so the dine-in posts never mention paying by phone.
- **No EBT/SNAP.** The app doesn't take it (planned for 2027), and no post implies it does.
- **English only.** Burmese version: pending the native check (K15). No new Burmese is written here.
- **The restaurant's details are copied from `apps/qr/lib/brand.ts`:** Mandalay Morning Star ·
  750 Terrado Plaza, Suite 33, Covina, CA 91723 · (626) 665-5317 · admin@mandalaymorningstar.com ·
  Instagram https://www.instagram.com/mandalays.morningstar/ · Facebook
  https://www.facebook.com/MandalayMorningStarLA/
- **The link is `qr.mandalaymorningstar.com`**, the app's production address.

**Screenshots:** take them on a phone from the real routes named below, using a test order with a
staff member's own name. Never show a real guest's name, order or phone number. Crop out the
browser bar.

---

## 1 · Launch post

**Markers:** [confirm before posting: the QR stickers are on the tables]

**Instagram / Facebook caption**

> Order from your phone at Mandalay Morning Star.
>
> Sit down, scan the QR code on your table, and the menu opens right there. Everyone at the table
> adds to one shared order, and you send it to the kitchen together. Ordering to go? Order ahead and
> pick a pickup time. Every screen is in English and Burmese.
>
> Start at qr.mandalaymorningstar.com
>
> 750 Terrado Plaza, Suite 33, Covina, CA 91723 · (626) 665-5317

**X version**

> Order from your phone at Mandalay Morning Star. Scan the QR code on your table, add dishes with your
> tablemates, and send it to the kitchen together. Or order ahead to go. qr.mandalaymorningstar.com

**Suggested visual:** the home screen (`/`) showing the three doors: Dine-in, To-go and Grocery.

**Alt text:** A phone showing the Mandalay Morning Star app's home screen with three choices:
Dine-in, To-go and Grocery, each labelled in English and Burmese.

---

## 2 · Dine-in at your table

**Markers:** [confirm before posting: the QR stickers are on the tables]

**Instagram / Facebook caption**

> How ordering at your table works:
>
> 1. Scan the QR sticker on your table. The menu opens for your table.
> 2. Tap a dish, pick its choices, and add a note for the kitchen if you have an allergy or a request.
> 3. Everyone at the table adds to one shared order. Tap Invite to share it with a friend's phone.
> 4. Send it to the kitchen. A short countdown lets you undo, just in case.
> 5. Watch each dish on your phone as the kitchen starts it and finishes it.
> 6. When you're ready, tap Pay at the counter and show your phone at the register.
>
> First time? The app walks you through it.

**X version**

> At our tables: scan the QR sticker, add dishes together on one shared order, send it to the kitchen,
> and watch each dish as it's cooked. Pay at the counter when you're ready.

**Suggested visual:** a carousel of four screens:

1. the dine-in menu (`/menu?mode=dinein`)
2. a dish's sheet, open on **A note for the kitchen**
3. the **Order** tab (`/cart`) with dishes sent, showing the pass
4. the bill after **Pay at the counter**: the pass the phone shows at the register

**Alt text:** Four phone screens from the Mandalay Morning Star app: the menu, a dish with a note for
the kitchen, a shared table order on its way to the kitchen, and the pass to show at the counter.

---

## 3 · To-go: order ahead, pick it up

**Markers:** [publish only after the live-payments cutover (C2)]

**Instagram / Facebook caption**

> Ordering to go? Order ahead from your phone.
>
> 1. Tap To-go and add your dishes.
> 2. Choose as soon as possible, or schedule a pickup time.
> 3. Add your first name and phone number, and pay on your phone.
> 4. Your order page follows it from the kitchen to ready.
> 5. When you get here, tap I'm here and we'll tell the counter.
> 6. When it's ready, show the code on your ticket at the counter.
>
> 750 Terrado Plaza, Suite 33, Covina, CA 91723

**X version**

> To go from Mandalay Morning Star: order ahead on your phone, pick as soon as possible or a pickup
> time, tap I'm here when you arrive, and show your code at the counter. qr.mandalaymorningstar.com

**Suggested visual:** the pickup order page (`/track`, from a test pickup order) showing the claim
ticket and the **I'm here** button. Take it within 30 minutes of the pickup time, when the button
shows.

**Alt text:** A phone showing a pickup order page with the steps Order placed, In the kitchen, Ready
for pickup and Picked up, a pickup ticket, and a button that says I'm here.

---

## 4 · Grocery: scan and go

**Markers:** [publish only after the live-payments cutover (C2)] · [confirm before posting: real
shelf codes and confirmed prices are in the app (C6)]

**Instagram / Facebook caption**

> Shopping our grocery aisles? Use your phone.
>
> Tap Grocery, then browse the aisles or scan the code on each package as you shop. Check your basket,
> tap Check out, and pay on your phone.

**X version**

> Shopping our grocery aisles? Tap Grocery in the app, browse or scan the code on each package, and
> check out on your phone. qr.mandalaymorningstar.com

**Suggested visual:** the grocery page (`/grocery`) with the scanner on, and the basket sheet open
with a few items.

**Alt text:** A phone pointed at a package's code in the grocery aisle, with the Mandalay Morning
Star app's scanner on screen.

---

## 5 · Three steps (short)

**Markers:** [confirm before posting: the QR stickers are on the tables]

**Instagram / Facebook caption**

> Three steps at your table:
>
> 1. Scan the QR code on your table.
> 2. Add your dishes and send them to the kitchen.
> 3. Pay at the counter when you're ready.

**X version**

> Three steps at our tables: scan the QR code, add your dishes and send them to the kitchen, then pay
> at the counter when you're ready.

**Suggested visual:** one graphic with three panels: the table's QR sticker, the dine-in menu
(`/menu?mode=dinein`), and the bill's **Pay at the counter** button (`/cart`).

**Alt text:** Three panels: a QR code sticker on a restaurant table, a phone showing the menu, and a
phone showing a button that says Pay at the counter.

---

## 6 · Stars (optional)

**Markers:** [publish only after the live-payments cutover (C2)] · [confirm before posting: whether a
dine-in order paid at the counter earns a Star; this post assumes only orders paid on the phone do]

**Instagram / Facebook caption**

> Every order you pay for in the app earns a Star. Collect enough and a reward is yours to use at
> checkout. Find your Stars under Account, then Rewards, and save them with your email so they stay
> with you.

**X version**

> Every order you pay for in the Mandalay Morning Star app earns a Star. Collect enough for a reward
> at checkout. Save them with your email under Account.

**Suggested visual:** the Rewards panel (`/account?tab=rewards`) from a test account, showing the
Stars ring and the "How it works" card.

**Alt text:** A phone showing the Rewards screen with a ring of Stars and a list explaining how
Stars and rewards work.

---

## 7 · Story / reel script (about 20 seconds, dine-in)

**Markers:** [confirm before posting: the QR stickers are on the tables]

Film at a real table with staff as the guests. No real guests' faces or orders.

| Shot | On screen                                                         | Caption text                    |
| ---- | ----------------------------------------------------------------- | ------------------------------- |
| 1    | A phone camera on the table's QR sticker                          | Scan the code on your table     |
| 2    | The dine-in menu (`/menu?mode=dinein`), scrolling                 | The menu opens for your table   |
| 3    | A dish sheet: a choice picked, a kitchen note typed, Add to order | Add a note for the kitchen      |
| 4    | A second phone joining with Invite                                | Everyone adds to one order      |
| 5    | **Send to kitchen**, then the countdown with **Undo**             | Send it to the kitchen together |
| 6    | The pass under **Order** (`/cart`) as a dish moves along          | Watch each dish as it's cooked  |
| 7    | **Pay at the counter**, then the phone held up at the register    | Pay at the counter              |
| 8    | End card: the name, address and link                              | qr.mandalaymorningstar.com      |

**End card text:** Mandalay Morning Star · 750 Terrado Plaza, Suite 33, Covina, CA 91723 ·
qr.mandalaymorningstar.com

**Voice-over (optional):** "Scan the code on your table. Add your dishes, and your friends add
theirs. Send it to the kitchen together, watch each dish as it's cooked, and pay at the counter when
you're ready."

**Alt text / description:** A short video at a Mandalay Morning Star table: a guest scans the QR code,
adds dishes with a kitchen note, a friend joins the order, the order goes to the kitchen, and the
guest pays at the counter.

---

## Before any of these go out

- Clear every marker on the post. **C2:** the live Stripe keys are switched on in production. **C6:**
  the grocery catalog has real shelf codes and confirmed prices.
- If paying for a table on the phone is switched on later, the dine-in posts can be updated then.
  Until that happens, they say "pay at the counter" only.
- Burmese versions: pending the native check (K15).
