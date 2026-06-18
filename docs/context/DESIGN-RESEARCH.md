# Design research — UX, the north-star teardown, paid kits & the craft layer

The distilled UI/UX research behind the v7.2 prototype: why the design is what it is, the competitor we model on, which **paid** kits are worth buying, and the component/motion/voice craft bar. Pair with [`FREE-KIT-MAP.md`](FREE-KIT-MAP.md) (the $0 stack), [`RUBRIC.md`](RUBRIC.md) (the bar), and the live tokens at [`packages/ui/src/tokens.css`](../../packages/ui/src/tokens.css). Design direction summary is in [`RESEARCH-DIGEST.md`](RESEARCH-DIGEST.md) §3.

## 1 · The job + the evidence

A guest at the table scans and wants to **eat, not learn an app**. The whole design optimizes one funnel — **scan → browse → customize → pay → relax** — with the fewest taps and zero dead ends. It's a _high-intent, low-patience, repeat_ surface: the user already decided to buy; the job is to not lose them (abandonment = lost revenue at the table). What the numbers say (web-verified June 2026):

- **QR order-and-pay lifts checks + speed** — Sunday reports +21% average check, 83% scan-to-pay.
- **Photos sell** — high-quality food photos ≈ +35% orders; the single highest-ROI content investment (self-host real MMS photography).
- **Wallets convert** — Apple/Google Pay cut cart abandonment vs. manual card entry; put them first.
- **Tip fatigue is real** — ~65% feel pressured by digital tip prompts; with a service charge already present, aggressive presets backfire — lead with "No extra," cap ≤20%.

## 2 · Ten principles for the MMS QR app

1. **One thumb, one flow** — primary actions in the bottom thumb-zone. 2. **Photo-first** with a graceful gradient+emoji fallback so nothing looks broken. 3. **Honesty as a feature** — service charge disclosed on menu _and_ cart (SB-1524), card prices with a cash-discount note. 4. **Tip without pressure.** 5. **Bilingual parity** — EN/Burmese equal citizens, Padauk, persistent one-tap toggle. 6. **Calm editorial warmth** — Fraunces + Hanken on warm paper; a teahouse, not a vending machine. 7. **Kiosk is a mode, not a different app** (denser targets/text, same code). 8. **Speed is a feature** — sub-2.5s LCP, AVIF, never block first paint on images. 9. **Accessible by default** — WCAG 2.2 AA, focus-visible, reduced-motion, ≥44px. 10. **Never a dead end.**

## 3 · Stage-by-stage (do / avoid)

| Stage                | Do                                                                       | Avoid                                                     |
| -------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Scan / landing       | Instant menu, table pre-filled, no login, one "Start"                    | Forcing install/account before browsing                   |
| Menu                 | Sticky category chips, photo per item, veg/allergen marks, search        | Unscannable text lists; hidden categories                 |
| Item + modifiers     | Big photo, required choices first (radios), add-ons (checks), live price | Hidden required steps; ambiguous "+$0"; no price feedback |
| Cart                 | Editable lines, running total, transparent fees                          | Surprise fees at the end                                  |
| Order type           | One-tap dine-in/to-go that changes tax + service charge                  | Burying it on a separate page                             |
| Tip + service charge | "No extra" first, charge disclosed up front, nothing pre-selected        | 18/20/25% with "None" hidden + pre-selected               |
| Payment              | Apple/Google Pay first, then card; guest by default                      | Mandatory account; tiny pay button                        |
| Status               | Order #, live stages, "we'll bring it over"                              | Dead-end "thank you" with no status                       |

## 4 · North-star teardown — Sunday (adopt the model, not the marks)

Sunday is a **web PWA** (no login, no install, no splash) engineered around "pay in 10 seconds": no auth gate, server-pre-loaded bill, bottom-sheet nav, Apple Pay one-tap. Published results: 83% scan-to-pay, +21% check, 71% tip rate, 5× more 5-star reviews. **Patterns to adopt:** large-title Fraunces **amount as the hero** (~40–56px, top-center); **3-mode split shown at once** (evenly / by-item / custom — not a wizard); **tip before payment** at peak goodwill; wallet-first pay; receipt by email/SMS (no lingering receipt screen); the **restaurant's brand dominates**, processor footnoted; celebratory success (bounce check + ~800ms green flash). Visual language = "iOS premium": flat white receipt surface, soft shadows, 12–16px radii, generous spacing, minimal line icons, **no food photos in the payment phase**, bottom sheets with a grab handle.

**Pitfalls to avoid (Sunday's own):**

- **⚠️ Review-gating is the trap, not the model.** Sunday routes 4–5★ to Google and captures 1–3★ privately. **We do NOT gate** — routing only happy raters to the public link risks Google review policy + FTC violations. Our pattern: ask _everyone_ for honest feedback, offer the Google link to _all_, and surface low ratings to staff immediately for recovery — never _block_ an unhappy guest from the public link. (Matches [`RED-TEAM.md`](RED-TEAM.md) "reviews ungated" + [`QA-CHECKLIST.md`](QA-CHECKLIST.md) C/P2.)
- **Never hide fees** — the on-screen total must be the **final** total before confirm; disclose the service charge + card/cash pricing (SB-1524). Sunday's Trustpilot complaints cluster on fees that surface only on the emailed receipt.
- **Don't go visually generic** — Sunday is brand-neutral _because_ it's infrastructure across thousands of venues; we're a destination brand — keep the palette, Fraunces numerals, and badge everywhere.
- **Skip AI dynamic tips** (needs Sunday's network) — A/B static presets. **Don't force pure-PWA on the kiosk** — a managed device can be native-hybrid for fonts/haptics/offline.
- Service-charge **rate is (confirm)** — prototype copy has used both 15% and 5%; lock one before launch and keep it consistent across menu, cart, and split math.

## 5 · Paid UI kits — the buy-list (quality-over-license)

The recommended paid stack to skip months of build, on our exact Next 16 + Tailwind v4 + shadcn/Radix stack. Prices/licenses web-verified June 2026 — **(confirm current pricing before purchase).** Pair with the free stack in [`FREE-KIT-MAP.md`](FREE-KIT-MAP.md).

| Buy                            | ~Price (one-time unless noted) | Why                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HeroUI Pro**                 | ~$249                          | The keystone — React-Aria a11y, Tailwind-v4-native, 210+ production components (sheets, selects, number inputs, date/time). Themeable to the Fraunces+Hanken stack; RN version seeds a future kiosk-native app. |
| **Motion+**                    | ~$149–199                      | Sits on free **Motion**; the Plus examples (spring tray, AnimateNumber, app-folder) ship the iOS micro-interactions in hours. MIT code is yours once in the repo.                                               |
| **shadcnblocks.com** (Premium) | ~$299                          | The scaffold layer — 1,500+ shadcn-CLI blocks (menu grids, cart drawers, checkout steps) + Next templates + Figma. `npx shadcn add` = no copy-paste drift.                                                      |
| **Mobbin Pro** (1 month)       | ~$40                           | Study 50k+ real screens (Toast Go, Caviar, Resy, Olo) during the research sprint, then cancel.                                                                                                                  |
| _Optional:_ **React Bits Pro** | ~$299                          | Editorial typography-first animated heroes for the **menu/browse** screens; use HeroUI for the transactional flow.                                                                                              |

**Total ≈ $790 one-time (+$40 Mobbin)**, ~$1,090 with React Bits. **Free to use alongside:** shadcn/ui core, Radix, **Origin UI**, **Untitled UI React** (React-Aria, MIT), **Motion**, **GSAP** (now fully free), **NumberFlow**, Apple Design Resources (study only). **License gotchas:** every paid kit forbids building a _competing_ UI-kit/marketplace (a single restaurant app is fine; renegotiate only if this ever becomes multi-tenant SaaS); shadcnblocks + Motion+ are single-seat (a contractor needs their own); **avoid MUI X** (per-dev/yr + conflicts with Tailwind v4); verify Aceternity's Tailwind-v4 support before buying.

## 6 · The craft layer (component states · motion · voice)

- **Tokens: primitives → semantic → component, no magic numbers** (single source of truth = `@mms/ui/tokens.css`). Every component ships **default · hover · active · focus-visible · disabled · loading · error** — not just default. Key ones: button (press `scale(.97)`, 2.5px focus ring, ≥54px), add-control `+`⇄stepper morph (tabular-nums), menu card (image fade-in; sold-out pre-disabled + struck), bottom sheet (grabber, spring up, symmetric dismiss), amount display (**number-roll** on change), tip selector ("No extra" first, ≤20%), empty states (never blank — illustration + line + CTA).
- **Motion: animate meaning, not decoration** — spring (not ease) for anything spatial, ≤300ms, symmetric enter/exit, GPU transform/opacity only, **always honor `prefers-reduced-motion`** (collapse to instant). Signature moments: add→stepper morph + count bounce; cart/total **number-roll** (~420ms ease-out, tabular-nums); bottom sheet `translateY` spring ~340ms; large-title collapse on scroll; pay-success bounce `scale(0→1.12→1)` + ≤80 particles; tracker pulse + connector shimmer. Haptics where supported (light on stepper, medium on add, success pattern on pay).
- **Voice: warm family-teahouse, bilingual EN/Burmese as equals, never sports-bar, never the banned broadcast/streaming words.** Descriptions earn their space (sensory/origin, not an ingredient list); modifiers use action language + price ("Add extra chili oil +$0.50"); errors say what to do and keep the cart ("Card declined — try another card or Apple Pay"); buttons are verbs ("Add to order," "Pay & leave," "I'm here"); Burmese is casual-warm diaspora register (တယ်/မယ်/နော်, Padauk, Burmese numerals), never translation-ese.

> Sources (web-verified June 2026): Sunday, Square, Toast, Uber Eats, Sweetgreen, Wagamama case studies; Snappr (photos); Apple HIG, NN/g, Baymard, Rauno Freiberg / Emil Kowalski (craft); WCAG 2.2; official pricing/license pages for each paid kit. Google review-gating + FTC endorsement guidance to verify at launch.
