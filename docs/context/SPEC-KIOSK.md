# SPEC-KIOSK — the front-of-house kiosk mode (W0 design source · builds M6·P6.1)

The design source for W6b's kiosk shell (validated on real hardware when it arrives; Terminal =
M6·P6.2, EBT = P6.3, both stay gated). Grounded in the W-track benchmark pass: McDonald's EOTF (the
canonical economics), Sweetgreen (placement), Bite (upsell), Toast/Square kiosk, GRUBBRR, US Access
Board / JAWS-for-kiosk. Governing principles: **the kiosk is a hardened large-touch MODE of the same
app** (same server-authoritative cart/tax/session — the kiosk is just another client that sends item
ids), and it lives **beside the counter, never instead of it** (Sweetgreen: kiosks stall first-timers
unless a host greets — the family at the counter IS the host; elders and cash-payers are warmly
redirected there).

## 1 · Economics to design for (why it's calm, not pushy)

McDonald's lift (+15–20% checks) comes from **unhurried, judgment-free browsing** — dwell, photos,
no cashier watching — not from prompt barrages. Bite's measured result: **ONE well-placed suggestion
beats three sequential prompts** on conversion AND perceived speed. So: no step timers mid-order,
photo-forward cards, a persistent add CTA, and **exactly one** upsell moment.

## 2 · Screen flow

1. **Attract loop** (idle): full-screen food/brand imagery — doubles as bilingual dish storytelling —
   with two big language tiles: **English / မြန်မာ** (language select IS the first interaction;
   persistent EN↔MY toggle in a fixed corner after — W5 provides the string system). A high-contrast /
   large-type toggle sits here too (ADA).
2. **Three doors** (mirrors the app's entry IA): **Dine in** (→ table/tent number) · **To-go**
   (→ first-name capture for the board) · **Grocery** (→ HID scan mode).
3. **Menu:** horizontal category rail (4–8 categories, ≥80px targets) over a **3-col grid** on a
   21.5–24" portrait panel; scroll within a category, never paginate. Required modifiers inline and
   gating (can't add without choosing); one-tap add for modifier-free items.
4. **One upsell** between "View order" and pay: rule-based from cart contents (curry → tea-leaf
   salad · any hot dish → milk tea · restaurant order → one featured grocery item), rendered as a
   dismissible rail **capped at 6 items** (Toast's cap) — never an interstitial that adds a tap to
   the pay path.
5. **Pay:** until Terminal hardware lands (P6.2), the shell ends at an **order-number handoff to the
   counter** ("pay at the counter — we have your order"). With Terminal: show a graphic OF the
   reader + an animated "tap below" arrow (eyes move to the right device); reader mounted adjacent,
   inside the reach zone.
6. **Done:** big order number + first name → the diner watches the `/board` Preparing|Ready screen.
   Receipt choice: SMS/email/none (one optional phone field can serve receipt + ready-text + future
   loyalty — always skippable, never a gate).

## 3 · Idle / privacy reset (non-negotiable)

30–60s idle → **"Still there?" countdown modal** (visible 10s count, `role="alertdialog"`,
reduced-motion-safe; any touch resets) → on expiry: **clear the cart, revoke the anonymous session
JWT, wipe all entered data, return to attract**. The next customer must never see the previous cart,
name, or phone number. Generous timer on the cart screen specifically (elderly-user studies: queue
pressure + small targets = abandonment).

## 4 · Touch + accessibility tier

- **≥68px primary targets** (~20mm at kiosk pixel density; Snackpass ships 56–96dp — "the larger the
  screen, the less precise users expect to be"), bottom action bar within standing reach.
- **ADA reach:** every operable part (touch zone, reader, receipt slot) between **15–48in** from the
  floor, clear 30×48in floor space — this constrains the enclosure/stand purchase, not just CSS.
- WCAG 2.2 AA carries over from the app (QA-CHECKLIST §A); add the attract-screen high-contrast +
  large-type modes. Full JAWS-for-kiosk hardware is optional at family scale; the reach rule and
  contrast modes are not.
- Task completable in **3–5 steps**; no account, no sign-in, no rewards-upgrade UI in kiosk mode
  (an anonymous walk-up surface).

## 5 · Kiosk mode = code seams (W6b)

A `kiosk` mode value alongside dinein/pickup/scango: route-locked entry (the device browser is
pinned to the kiosk route; app-level guard rejects navigation out), the big-touch token tier, the
idle/reset machinery, and an **HID keydown buffer** — a USB barcode scanner is a keyboard wedge
(digits + Enter), routed through the existing `scanAdd` exactly like the phone camera (works for
modifier-free SKUs, which grocery items always are). Amounts stay server-derived via `getCartTotals`.

## 6 · Hardware (recommendation-led — PRODUCTION_PLAN §5)

**iPad + counter stand with reader mount** (~$400–700, the Square-style cheapest-credible path) at
family volume; a 21.5–24" portrait Elo/Android countertop unit (~$1,000–1,500) only if volume earns
it. Placement: beside the register line, counter focal point preserved. HID scanner ~$40. S700
reader when Terminal lands.
