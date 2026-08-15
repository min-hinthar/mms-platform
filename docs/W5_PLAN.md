# W5_PLAN — One tongue (the app-wide EN↔MY toggle)

> ## ⚠️ SUPERSEDED ON THE TOGGLE (W16b, 2026-08-15 — owner: "Ditch the language toggle and have
>
> bilingual only")
>
> Everything below describing a **toggle / locale carrier / per-user language** is HISTORY, not a
> spec: `LocaleToggle`, `LocaleProvider`, the `mms_locale` cookie + Accept-Language seed,
> `setLocalePref` / `lang_change`, `body.my`, and the `mms.qr.locale` handover exemption are all
> **deleted**. `<html lang="en">` is fixed and Burmese renders as per-span `lang="my"` accents.
>
> **What survives, and what L3–L5 still mean:** the typed `lib/i18n` dictionaries, their guards,
> and `t(locale, key)` are the bilingual string source. L3 (/track + receipt), L4 (menu/grocery),
> and L5 (account/errors + the kiosk-dictionary merge) are still the right surface list — but each
> ships as **STACKED bilingual** (EN primary + a Padauk MY line/accent on the same surface, per
> `docs/W16_PLAN.md` §W16b), never as a language the diner picks. Read the W16b render idiom in
> `apps/qr/components/Checkout.tsx` (`T()` + the `<My/>` accent, and the bilingual `Row`) before
> starting L3.

**Status: W5-L1+L2 SHIPPED (2026-08-15); L3–L5 remain as follow-on PRs.** L2 residuals carried to
L3: peer-lock/split/settling copy, the pay-step status words at PaymentSection/track, the
"includes $X tip" subline, Undo-window strings — all still EN. Owner directive: "bilingual toggle
W5 world class." Closes
registry **S2 (high)**: no EN↔MY toggle; `<html lang>` never switches (the `layout.tsx` comment
describes unwritten code); the money path is monolingual for the community the family actually
serves. Design parents: `docs/context/DESIGN-RESEARCH.md` principle 5 ("EN/Burmese **equal
citizens**, Padauk, persistent one-tap toggle") + §voice (casual-warm diaspora register —
တယ်/မယ်/နော် — never translation-ese), `docs/PRODUCTION_PLAN.md` §W5 ("the moat, currently one
field deep"), `docs/prototype/v7.2.html` (the toggle, `body.my`, and ~45 authored MY strings —
**including the money-path CTAs**), `docs/HOLISTIC_IMPROVEMENT_PLAN.md` §shared voice spec (the
glossary), `lib/kiosk/strings.ts` (the proven typed-dictionary pattern).

**Slice labels are `W5-L1…L5`** — `W5a–W5g` were consumed by the Richness track for unrelated
slices; the bilingual milestone gets fresh letters.

## What the map established

- The mechanics half of the feature is fully specified by the prototype: `setLang` sets
  `<html lang>`, toggles `body.my` (the Padauk face + `letter-spacing: 0` + `line-height: 1.4`
  reset), fires `lang_change` analytics, re-renders. The app has NONE of it — zero
  `Accept-Language`/`navigator.language` readers, `mms_profiles.locale` dead since M4.
- The kiosk owns the only real dictionary (44 keys, `as const` + `keyof` = compile-time missing-key
  safety + structural EN/MY parity) — and its own private fork is why S14a's vocabulary drift
  exists (formal `သင့်မှာယူမှု` vs the app's diaspora `သင့်အော်ဒါ`).
- ~60 `lang="my"` accent sites already exist; the diner string surface is ≈850–900 strings, of
  which the money path (cart/checkout/split/tip/pay) is ~240 — the largest and the one with
  authored prototype MY copy waiting.
- Padauk is already globally loaded (`next/font`, latin+myanmar subsets); in MY mode it becomes
  the LCP-critical body face — the CLS risk needs `adjustFontFallback` + the typographic reset.
- Every customer route is a Server Component except `/grocery`; the root layout is
  `force-dynamic`, so a cookie read in the layout is free and nothing is statically cached.

## The architecture (W5-L1 — foundation)

- **`lib/i18n/`** — typed dictionaries, one module per surface, one shared core:
  `types.ts` (`Locale = "en" | "my"`, `Entry = { en; my }`) · `common.ts` (chrome, nav, actions,
  the S14a **glossary**) · then per-surface modules as the rollout lands (`cart.ts`, `track.ts`,
  `menu.ts`, `grocery.ts`, `account.ts`, `errors.ts`) · `index.ts` (`DICT` merge + `t(locale,
key)` + `Key = keyof typeof DICT`). `as const` beats the prototype's silent-passthrough `T()`:
  a missing key is a COMPILE error.
- **`lib/i18n/strings.test.ts` — seven red-first guards** (the contrast-audit walk-the-real-data
  pattern): EN/MY parity (no empty `my`); no untranslated placeholders (`my !== en` outside an
  explicit `IDENTICAL_BY_DESIGN` allowlist — brand names, "Covina", phone); every `my` contains
  `\p{Myanmar}`; **no Burmese digits (၀–၉) in money/legal-tagged keys** (the DESIGN-RESEARCH
  "Burmese numerals" voice rule is deliberately overridden on the money path — flagged in-file);
  the S14a glossary rule (`အော်ဒါ`, never `မှာယူမှု`, across the order-vocabulary keys); key-shape
  checks. Each induced red, then reverted.
- **Locale carrier — cookie `mms_locale`** (`en|my`, `path:/`, `sameSite:lax`, `secure` in prod,
  1y, **not** httpOnly — the client flips it synchronously): read in the root layout →
  `<html lang={locale}>` + `<body className>` gains `my` → `initial` into a new root
  **`LocaleProvider`** (the ActiveOrderProvider root-context pattern, seeded from the SERVER so
  there is no EN→MY flash). `setLocale(l)` writes cookie + `mms.qr.locale` mirror +
  `document.documentElement.lang` + `body.my` synchronously (instant flip for the ~95% of strings
  living in client leaves), then `router.refresh()` for the RSC shells, then fire-and-forget the
  profile sync.
- **First visit**: seed the cookie from `Accept-Language` in `proxy.ts` only when absent —
  default **EN** (diaspora phones are routinely set to en-US; the toggle is prominent instead of
  the guess being silent).
- **Profile sync** — `setLocalePref` server action (the `setDisplayName` shape verbatim: SSR uid,
  rate guard, service-role upsert, discriminated result), writing the dead-since-M4
  `mms_profiles.locale` (CHECK already mirrors the bound). Anon = cookie only, silently.
- **Device-session hygiene boundary**: `mms.qr.locale` is a PERSON's setting, not an order
  pointer — **exempt from the W14 handover clear** (a survivors-list entry in
  `lib/device-session.ts` + a red-first case in its existing test).
- **The toggle** — `AppHeader` (persistent on every diner route, already self-hides on
  staff/board/kiosk): the kiosk's single-button form — a 44px control whose **visible label is
  the TARGET language's own name** (`မြန်မာ` in EN mode / `English` in MY mode, `lang` attr on
  the Burmese label, NO English aria-label — the KioskShell rule, verbatim). Mirrored as a
  🌐 Language row on `/account` (the v7.2 Settings row). `lang_change` PostHog event.
- **Type/perf hardening**: Padauk `adjustFontFallback`/`fallback` metrics; a `body.my`
  typographic reset (`--track-display`/`--track-eyebrow` → 0, `--lh-my` applied globally,
  `overflow-wrap: anywhere` on MY subtrees — Burmese has no inter-word spaces); interleaved
  English (phone, "Covina", promo codes) gets `lang="en"` per QA-CHECKLIST §A.

## The rollout (money path first — that's where the moat is zero)

- **W5-L1 · Foundation** (above) + `common.ts` chrome strings only — the toggle visibly works on
  day one, `<html lang>` finally switches, CLS is measured before 900 strings depend on it.
- **W5-L2 · The money path** — `i18n/cart.ts` (~240 keys): /cart headings + line chrome + send/
  pay CTAs + tip ask + promo/reward + split + lock/settling copy + PickupWhenChoice. The
  prototype's authored MY money copy is the source of record (`အမှာ တင်`, `ရှင်းပြီး ထွက်`,
  `ကတ် ငြင်းပယ်ခံရသည်` + `ထပ်ကြိုးစား`, `ရှင်းပြီး။ ကျေးဇူးပါ`…); net-new strings follow the
  register. **`lib/receipt-view.ts` and `lib/totals-math.ts` stay monolingual** (their labels are
  mutant-pinned money surface — translation happens at the render site via keys). **SB-1524: the
  MY line ACCOMPANIES the EN disclosure, never replaces it** (the EN text is the legally
  operative artifact; `5%`, `CA SB-1524`, `$` stay Latin).
- **W5-L3 · /track + receipt** — the post-pay surface an elder reads alone; also closes the
  receipt artifact's `nameMy: null` gap where the catalog join is safe.
- **W5-L4 · Menu + item sheet + grocery** — highest volume, cheapest per string (catalog data
  already bilingual from W5c/W4b).
- **W5-L5 · Account/rewards + errors/outage + the kiosk-dictionary merge** (kiosk consumes
  `lib/i18n` — mechanically closes **S14a**: one glossary, one `အော်ဒါ`) + the EN-only homepage
  hero (closes the WORLD_CLASS_UX deferral).

L1+L2 ship as ONE PR (this slice); L3–L5 follow as their own PRs on the same discipline.

## Hardening + the rules that bind

- Money discipline: no pure money module gains locale awareness; every translated money string is
  presentation at the render site; amounts/dates keep `en-US` + `$` + Latin digits (**dates stay
  en-US in v1** — 9 Intl sites, `receipt-view.test.ts` is the tripwire; registry note).
- Pluralization: Burmese is authored plural-free — **no i18n library, no ICU** (a `{en, my}`
  lookup is the whole engine; hand plurals stay EN-side).
- The locale flip is NOT a route change: no `startViewTransition`, no new animation.
- a11y: the toggle's visible target-language label IS the accessible name; `lang` attributes
  correct in both directions (MY mode marks interleaved English `lang="en"`); TTS-verifiable.
- K15: every net-new MY string joins the native-check list **as one owner-reviewable artifact
  per surface module** (not per-PR drips); the SB-1524 MY line is flagged as check-before-trust.
- New logic testable by construction: dictionaries + guards are pure `.ts` (the no-`.test.tsx`
  wall makes this mandatory, not stylistic).

## Deliberately out (registry)

- `generateMetadata`/share-card localization (EN is the safe default for strangers).
- Localized dates/numerals (v1 keeps en-US/Latin — revisit with the native check).
- Spanish as a third language (PRODUCTION_PLAN: only after MY is real).
- The email receipt's locale (send-time device locale ≠ read-time preference — its own decision).
- Staff/KDS/register/board surfaces (~400 strings — staff-facing, different register).

## Slices

- **W5-L1** — `lib/i18n` core + 7 guards (red-first) · cookie/provider/`<html lang>`/`body.my` ·
  Accept-Language seed · AppHeader toggle + /account row · `setLocalePref` · device-session
  exemption · Padauk metrics + MY typographic reset · `lang_change` analytics.
- **W5-L2** — the money path (`i18n/cart.ts` + Checkout/split/tip/pay render sites + SB-1524
  accompaniment).
- **W5-L3/L4/L5** — track/receipt · menu/grocery · account/errors/kiosk-merge (follow-on PRs).
- **W5·gate** — docs sweep (S2 progress, S14a on L5, K15 additions, CHANGELOG/ROADMAP/HANDOFF) ·
  gates · ONE capped review · PR → auto-merge.
