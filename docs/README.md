# docs/ — what each file is for

One line per file, grouped by how you use it. **Paths are permanent:** code comments, tests, hooks,
`CHANGELOG.md` and `ROADMAP.md` cite them, so a file changes group here, never its path. A new doc
gets a line here in the PR that adds it.

## Start here — live state (read every session)

- [HANDOFF.md](HANDOFF.md) — the pickup point: where the build stands and the next tasks.
- [OPEN-ITEMS.md](OPEN-ITEMS.md) — the single open-work registry; sweep it in every PR. IDs never change.
- [WORKFLOW.md](WORKFLOW.md) — the loop, the CI lanes, the review and the merge ritual (§Review step 5 is normative, the Codex-out-of-quota rule included).
- [OWNER_RULINGS_2026-10-07.md](OWNER_RULINGS_2026-10-07.md) — the owner's binding rulings (the 2026-10-07 brief and later gate decisions); they win over a stream card.
- [PATH_DESIGN_2026-10-07.md](PATH_DESIGN_2026-10-07.md) — the owner's path-design picks: the build source for PD1–PD13. One spec per moment in [path-design-2026-10-07/](path-design-2026-10-07/):
  - [m1-tablemate-send.md](path-design-2026-10-07/m1-tablemate-send.md) — the tablemate's Send ("Next Stop: Kitchen")
  - [m2-bill-at-table.md](path-design-2026-10-07/m2-bill-at-table.md) — asking for the bill at the table
  - [m3-pickup-promise.md](path-design-2026-10-07/m3-pickup-promise.md) — the pickup promise, from the Pay tap to the bag
  - [m4-grocery-miss.md](path-design-2026-10-07/m4-grocery-miss.md) — a grocery scan that misses
  - [m5-kitchen-round-two.md](path-design-2026-10-07/m5-kitchen-round-two.md) — a second round on a ticket still cooking
  - [m6-walk-up-cash.md](path-design-2026-10-07/m6-walk-up-cash.md) — the walk-up cash sale at the counter
  - [m7-clearing-a-table.md](path-design-2026-10-07/m7-clearing-a-table.md) — clearing a table
  - [m8-manager-approval.md](path-design-2026-10-07/m8-manager-approval.md) — a dish needs a manager
  - [m9-tv-board.md](path-design-2026-10-07/m9-tv-board.md) — the TV board: live progress per table and per dish
  - [m10-live-pass-pay.md](path-design-2026-10-07/m10-live-pass-pay.md) — the guest's live pass, then pay once served
  - [m11-diner-guide.md](path-design-2026-10-07/m11-diner-guide.md) — the diner's first-visit guide
  - [m12-staff-guides.md](path-design-2026-10-07/m12-staff-guides.md) — staff step guides
- [context/INDEX.md](context/INDEX.md) — the research map a session hook loads at start.

## Rules every change is built against

- [DESIGN-LANGUAGE.md](DESIGN-LANGUAGE.md) — the as-built design doctrine; read before any visual, motion or copy work. Cite by §N.
- [MOTION_AND_PERF.md](MOTION_AND_PERF.md) — the motion and mobile-perf budget (§4's mobile rule is now M126's `data-fx` dial — DESIGN-LANGUAGE §1).
- [ENV.md](ENV.md) — env vars and secrets per Vercel environment.
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) — the DB/backend design of record: QR's own Supabase project, migrations, typing.
- [ARCHITECTURE.md](ARCHITECTURE.md) — the June product spec and build architecture (the as-built docs win where they differ).
- [context/QA-CHECKLIST.md](context/QA-CHECKLIST.md) — the acceptance gate; tick what a change touches in its PR body.
- [context/RUBRIC.md](context/RUBRIC.md) — the ≥4.3 world-class bar, with the O-axes for staff surfaces.
- [context/RED-TEAM.md](context/RED-TEAM.md) — the standards and the known traps.
- [context/RESEARCH-DIGEST.md](context/RESEARCH-DIGEST.md) — the decisions and facts that constrain the build.
- [context/DESIGN-RESEARCH.md](context/DESIGN-RESEARCH.md) — UX research, the Sunday teardown, the paid-kit list, the craft bar.
- [context/FREE-KIT-MAP.md](context/FREE-KIT-MAP.md) — the $0/mo stack.
- [context/ORDER-MODEL.md](context/ORDER-MODEL.md) — who owns the order and who may edit it (`canMutateLine`).
- [context/SPEC-KDS.md](context/SPEC-KDS.md) — kitchen · expo · order-ready board (W0 source).
- [context/SPEC-GROCERY.md](context/SPEC-GROCERY.md) — the grocery market: browse · scan · basket · exit (W0 source).
- [context/SPEC-KIOSK.md](context/SPEC-KIOSK.md) — the kiosk mode (W0 source; the kiosk is parked in production).
- [prototype/v7.2.html](prototype/v7.2.html) — the canonical diner visual reference and the source of verbatim copy (a test reads it; never edit).
- [data/MENU_REFERENCE.md](data/MENU_REFERENCE.md) — the generated catalog × POS record (never hand-edit; `data/*.json` are its inputs, and `check:docs` byte-compares it).

## Current plans and designs still built against

- [PHASE3_JOURNEYS.md](PHASE3_JOURNEYS.md) — Phase 3, the journeys: the slices 3a–3f.
- [PILOT_PLAN.md](PILOT_PLAN.md) — the family pilot: the P gate, owner actions, the Day-0 script.
- [GROCERY_MARKET_PLAN.md](GROCERY_MARKET_PLAN.md) — the grocery vertical's plan-of-record.
- [QR_FROM_DELIVERY.md](QR_FROM_DELIVERY.md) — what QR adopts from the delivery app (the M5 backlog).
- [M5_DESIGN.md](M5_DESIGN.md) — the decision: the repos stay separate; QR learns from delivery.
- [M6_DESIGN.md](M6_DESIGN.md) — kiosk · Terminal · EBT (2027), the design of record.
- [QBO_SYNC.md](QBO_SYNC.md) — QuickBooks sync of paid orders: the model and the activation steps (ships dark).
- [SHARED_DEVICE.md](SHARED_DEVICE.md) — switch, remember and lend an account on a shared device.
- [CART_INTENT_LINK.md](CART_INTENT_LINK.md) — the cart→intent link (built as M151; kept as the design record later rows cite).
- [STAFF_POLISH_AUDIT.md](STAFF_POLISH_AUDIT.md) — the seven-surface staff console audit (2026-09-20).

## History — finished plans, audits and logs (kept for the record and the code that cites them)

- [HANDOFF_ARCHIVE.md](HANDOFF_ARCHIVE.md) — superseded HANDOFF pickup notes, moved out of the live file.
- [REVIEW.md](REVIEW.md) — the M0→W22 QA log (historical; QA ticks now live in each PR body).
- [PHASE3B_DESIGN.md](PHASE3B_DESIGN.md) — 3b: three places, one order (built).
- [PHASE3C_DESIGN.md](PHASE3C_DESIGN.md) — 3c-i: the bill is a receipt you can read (built).
- [PHASE3C_II_DESIGN.md](PHASE3C_II_DESIGN.md) — 3c-ii: the table bound at Send (built).
- [A4_PLAN.md](A4_PLAN.md) — `/staff` to five screens (A4, built).
- [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md) — the W-track plan (2026-07-16).
- [W5_PLAN.md](W5_PLAN.md) — the EN↔MY toggle (retired by W16b: bilingual only).
- [W6A_PLAN.md](W6A_PLAN.md) — the front-of-house register.
- [W6B_PLAN.md](W6B_PLAN.md) — the kiosk shell.
- [W6C_PLAN.md](W6C_PLAN.md) — Stripe Terminal (M6·P6.2 pulled forward).
- [W7A_PLAN.md](W7A_PLAN.md) — the receipt artifact.
- [W7B_PLAN.md](W7B_PLAN.md) — the resilience shell.
- [W8_PLAN.md](W8_PLAN.md) — the money-path test harness.
- [W9_PLAN.md](W9_PLAN.md) — journeys that finish.
- [W10_PLAN.md](W10_PLAN.md) — honest when the backend is down.
- [W10_MATRIX.md](W10_MATRIX.md) — W10's raw surface audit.
- [W11_PLAN.md](W11_PLAN.md) — the durable split ledger.
- [W12_PLAN.md](W12_PLAN.md) — the two-moment checkout.
- [W13_PLAN.md](W13_PLAN.md) — the premium-feel slice.
- [W14_PLAN.md](W14_PLAN.md) — the profile slice.
- [W15_PLAN.md](W15_PLAN.md) — POS truth.
- [W16_PLAN.md](W16_PLAN.md) — the owner's reset (bilingual only; service charge retired).
- [W17_PLAN.md](W17_PLAN.md) — real POS pricing · staff price control · tipping.
- [W22_DESIGN_PROPOSAL.md](W22_DESIGN_PROPOSAL.md) — the W22 slate (shipped, except W22d's light half — M86).
- [W22D_HUE_DECISION.md](W22D_HUE_DECISION.md) — the aubergine hue: built (#235), then reverted.
- [JOURNEY_PLAN.md](JOURNEY_PLAN.md) — J0–J6, paths over screens.
- [JOURNEY2_PLAN.md](JOURNEY2_PLAN.md) — K0–K6, one house with three doors.
- [RICHNESS_PLAN.md](RICHNESS_PLAN.md) — R1–R9, delivery-grade UI.
- [R6_PLAN.md](R6_PLAN.md) — the menu signature slice.
- [R7_PLAN.md](R7_PLAN.md) — checkout and the pay-success celebration.
- [R8_PLAN.md](R8_PLAN.md) — `/track` and rewards.
- [R9_PLAN.md](R9_PLAN.md) — the staff floor and the homepage.
- [HOLISTIC_IMPROVEMENT_PLAN.md](HOLISTIC_IMPROVEMENT_PLAN.md) — the cross-repo audit plan (2026-07-02).
- [WORLD_CLASS_UX_PLAN.md](WORLD_CLASS_UX_PLAN.md) — the 2026-07-02 UX direction.
- [M4_DESIGN.md](M4_DESIGN.md) — rewards and account.
- [S1_AUDIT.md](S1_AUDIT.md) — staff and floor, retrospective audit.
- [S2_DESIGN.md](S2_DESIGN.md) — line lifecycle and authority.
- [S2_AUDIT.md](S2_AUDIT.md) — S2, retrospective audit.
- [S3_DESIGN.md](S3_DESIGN.md) — tabs (deferred settlement).
- [S4_DESIGN.md](S4_DESIGN.md) — the unified basket.
- [S4_AUDIT.md](S4_AUDIT.md) — S4 audit.
- [DATA_RECONCILIATION.md](DATA_RECONCILIATION.md) — the shared-project era (superseded; nothing in it is an instruction).
- [GROCERY_SCANGO.md](GROCERY_SCANGO.md) — the June Scan & Go sketch (superseded by context/SPEC-GROCERY.md).
- [screenshots/w3/](screenshots/w3/) — W3 kitchen screenshots (cited by REVIEW.md).
