# Phase 2a · register — integration notes

Scope: the two live register hotfixes (register spec problems 1, 4, 10) — a typed comma recorded 100×
the cash tip; a rejected secure-tab close latched on "Charging…". Everything else in the register spec
(tendered block, quick cash, Button conversions, `quotedCents` compare-and-swap, `onChanged`,
HandoffCard, register-math additions) is 2c.

## 1. DESIGN-LANGUAGE draft (§17 bullets)

- **A typed money amount is read once, on the whole string, in integer cents.** A staff money field's
  `onChange` only REFUSES characters (`sanitizeMoneyInput` — digits, one `.`, commas before the dot,
  ≤2 decimals, ≤12 chars); it never rewrites or drops a comma, because a keystroke cannot know what the
  next key will make of it. What a comma means is decided at read time by `parseMoneyCents` (a dot
  present → grouping; comma-only ending in 1–2 digits → decimal comma; else grouping), with integer
  arithmetic — never `parseFloat × 100`. A chip that fills a money field is lit by VALUE
  (`parseMoneyCents(field) === cents`), not by the field's spelling.
- **A rejected charge action is an UNKNOWN outcome, and says so.** When a Server Action that may have
  moved money rejects (the connection dropped), the control clears busy, closes its confirm (focus
  returns to the trigger) and renders its own `kind: "local"` dictionary sentence through `<Chrome>` —
  never the write-outage twin, whose "that change wasn’t saved" is false for a charge that may have
  landed. Server-returned sentences keep going through `<OutageText>` (the `SettleError` split).

## 2. CHANGELOG

- **Register hotfixes (Phase 2a).** A cash tip typed key by key as "5,00" recorded $500 (measured:
  `tipCents` 50000) — the comma rule now runs on the whole string in integer cents
  (`lib/money-input.ts`), the field only refuses characters, tip chips light by value, and an 8+-digit
  tip is refused as over the cap. A secure-tab close whose action rejected no longer latches on
  "Charging…": the confirm closes, focus returns to the trigger, and the alert says the card may or may
  not have been charged (`settle.card.unknown`).

## 3. OPEN-ITEMS rows

| Sev  | Item                                                                                                        | Why / where                                                                                                                                                                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High | `paymentInFlightReason`'s "Someone’s already paying on their phone" refusal is false on a staff-held freeze | `lib/staff-cart.ts` `closeSecureTab`: after an unknown-outcome close the freeze is HELD (by design), so the "try again" the new `settle.card.unknown` sentence invites is refused with a sentence about a guest's phone. Needs a staff-freeze-aware refusal (register spec out_of_scope). |
| Med  | Compare-and-swap on `closeSecureTab`'s "Charge $x" confirm                                                  | Same stale-quote class as the cash settle's (register problem 2): the confirm quotes the last-polled total, the server charges `getCartTotals` live. Parked surface; register spec out_of_scope.                                                                                          |
| Med  | A REJECTED cash settle says "that change wasn’t saved" — it may have been                                   | `CashSettleButton.confirm`'s catch sets `STAFF_WRITE_OUTAGE`; a response lost AFTER `mms_fulfill_cash_order` committed means the settle landed. Same unknown-outcome class this PR fixed for the secure close; found, not in 2a scope.                                                    |
| Low  | "this tab settles itself in a minute" is unmeasured                                                         | `settle.card.unknown` (and the server arm's own sentence in `closeSecureTab`) promise the webhook fulfils within a minute. Starting copy mirrored from the server arm; webhook latency not measured here (no Stripe keys).                                                                |
| Low  | CloseSecureTab Cancel/Charge and the trigger are still native `disabled` / hand-styled                      | Button conversion (aria-disabled + aria-busy, K35 −2) is 2c; test 7's "no native disabled attribute" bullet lands with it.                                                                                                                                                                |
| Low  | `CashSettleButton` docblock still says the tip is "not recorded"                                            | False since W17c-2 (the cash tip IS recorded). Register change 5 corrects it in 2c.                                                                                                                                                                                                       |
| Low  | A European-format paste "1.234,56" reads as $1.23                                                           | `sanitizeMoneyInput` refuses commas after the dot and a third decimal; the old code read it the same (1.23456 → 123). Over the tip cap either way; the tendered field is display-only. Nice-to-do.                                                                                        |

## 4. Mutate-set / CLAUDE.md enumeration changes

Measured with the prescribed grep after this branch: `apps/qr/app/api` 3 · `apps/qr/lib` 123 ·
components 15 · `packages/db/src/schemas.ts` 1 = **142 files** (base: 139). Mutants: **798** (base 792,
`grep -cE '^\s+id: "' scripts/verify-slice.mjs`).

Files added to the mutate set:

- `apps/qr/lib/money-input.ts` — bucket **lib**
- `apps/qr/components/staff/CashSettleButton.tsx` — bucket **component**
- `apps/qr/components/staff/CloseSecureTabButton.tsx` — bucket **component**

CLAUDE.md (integration): bucket sentence → `123+3+15+1=142`, "FIFTEEN components", and NAME
`staff/CashSettleButton.tsx` and `staff/CloseSecureTabButton.tsx` in the list; the mutation count
(792 → 798 from this area alone) wherever it is quoted — re-measure after all four areas merge.

Mutants added (block `// ── Phase 2a · register ──`, end of the array), all **KILLED**
(`pnpm verify:slice --no-gate --only=p2a-register`):

- `p2a-register/money-input-sanitizer-drops-commas`
- `p2a-register/money-input-no-decimal-comma`
- `p2a-register/money-input-third-decimal`
- `p2a-register/money-input-float-times-100`
- `p2a-register/cash-tip-field-drops-commas-per-keystroke`
- `p2a-register/secure-close-rejection-escapes`

Mutants re-anchored: none (`check:mutant-anchors` clean, 798 anchors / 142 files).

## 5. Owner-visible behaviour changes

- Cash sheet: a tip typed "5,00" (or "12,50") records $5.00 ($12.50) — it used to record $500
  ($1,250 → over cap). The field keeps exactly what was typed (the comma no longer vanishes mid-entry).
  The same reading applies to the "Cash tendered" field.
- A third digit after the decimal point is refused as it is typed (was accepted and silently rounded).
- A quick-tip chip lights whenever the field holds its amount in any spelling ("8", "8,00", "8.00").
- A tip with more than seven whole-dollar digits shows the over-cap line and Settle refuses (it was
  already over the cap before; the new parser would otherwise have read it as no tip).
- Close tab · card on file: if the connection drops while charging, the confirm closes, focus is back
  on the "Close tab" button, and the alert reads "The connection dropped, so we don’t know if the card
  was charged. Don’t take cash or another card yet — if the charge went through, this tab settles
  itself in a minute. If it doesn’t, try again." (Before: stuck on "Charging…" with both buttons
  disabled until a reload.)

## 6. K15 strings

| Key                   | EN                                                                                                                                                                                                 | MY                                                                                                                                                                                 | HIGH?                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `settle.card.unknown` | The connection dropped, so we don’t know if the card was charged. Don’t take cash or another card yet — if the charge went through, this tab settles itself in a minute. If it doesn’t, try again. | ချိတ်ဆက်မှု ပြတ်သွားလို့ ကတ်ကနေ ဖြတ်ပြီးပြီလား မသိရပါ။ ငွေသား ဒါမှမဟုတ် တခြားကတ် မယူပါနဲ့ဦး — ဖြတ်ပြီးသားဆိုရင် ဒီစာရင်း တစ်မိနစ်အတွင်း သူ့ဘာသာ ပိတ်သွားပါမယ်။ မပိတ်ရင် ထပ်စမ်းပါ။ | yes (marker + `STAFF_K15_HIGH`) |

## 7. Deviations from spec

- **An unparseable tip WITH digits is invalid, not zero.** `parseMoneyCents` returns `null` past seven
  whole-dollar digits; `tip = parseMoneyCents(...) ?? 0` alone would have turned "123456789" (over cap
  before) into a settle with no tip. `tipValid = parsed != null ? cents ≤ cap : !/\d/.test(tip)` —
  digit-free text ("", ".", ",") stays "no tip" as before. Pinned by a new component case (red-first
  against the `?? 0`-only shape). The cap literal (`<= 100000`) is unchanged.
- **`centsToField` for the kiosk pre-fill and the chip fill** (item 5's "format" import) — replaces
  `(c / 100).toFixed(2)`; identical text for integer cents. Nothing else from item 5.
- **The unknown-outcome alert renders `echo={false}`** — it is a live region (echo policy: no
  bilingual announcement), matching `TerminalSettle`'s `settle.reader.startFailed`.
- **Test 7's aria-busy bullet is vacuous on today's component** (it never sets `aria-busy`; the latch
  was native `disabled` + "Charging…"). It is kept for 2c's Button conversion; the load-bearing
  assertions are: the confirm group is gone, "Charging…" is gone, focus is on the trigger, the alert is
  `settle.card.unknown` and not the outage sentence. Red-first against the base component: 2 of 3
  cases red + 2 unhandled rejections.
- **"Remove the catch" mutant is a rethrow** (`throw e;` as the catch's first statement) — the same
  observable behaviour as no catch, with a stable one-line anchor.
- **The tendered field** also moved onto `sanitizeMoneyInput`/`parseMoneyCents` (the scope's "delete the
  local sanitizeMoney and the parseFloat lines" covers both of its uses).

## 8. LEARNINGS candidates

- **A per-keystroke sanitizer must never DECIDE, only refuse.** Any rule whose meaning depends on
  characters not yet typed (a comma that is decimal only if ≤2 digits follow) is wrong on every prefix
  of the input. "5,00" pasted was always right; "5,00" typed was $500 — a test that feeds the whole string
  would be green for the wrong reason. Test typed input as a fold over keystrokes.
- **A parser that returns `null` for "too big" must not be defaulted with `?? 0` at a cap check** —
  that turns the largest inputs into the smallest.
