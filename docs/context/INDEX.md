# Context — read this first

**Why this folder exists.** Claude Code remote sessions only have `main`. The full research history — the prototype lineage (v1→v7.2), the red-team reports, the strategy deep-dives — lives in Min's Cowork workspace and is **not** in git. This folder is the **distilled, durable** subset a session needs to build correctly. The principle: **conclusions live in git; process stays in Cowork.**

## Read order

1. **[RESEARCH-DIGEST.md](RESEARCH-DIGEST.md)** — the decisions + the facts that constrain the build (business, design, compliance, pricing). Start here.
2. **[QA-CHECKLIST.md](QA-CHECKLIST.md)** — the launch gate. Every milestone exits against it; the **in-session adversarial subagent + the two Codex rounds** cross-check it (CI runs no Claude review — see `CLAUDE.md` § Pre-PR self-review sweep). `docs/REVIEW.md` tracks which items the open milestone has closed.
3. **[RUBRIC.md](RUBRIC.md)** — the 10-dimension world-class bar (target ≥ 4.3).
4. **[RED-TEAM.md](RED-TEAM.md)** — the standards + the known traps that shaped the build.
5. **[ORDER-MODEL.md](ORDER-MODEL.md)** — how the order is owned (the table, not the phone), who may edit it (line-state × role), and how voids/refunds are authorized. **Now as-built** — the spine is `canMutateLine` (`apps/qr/lib/permissions.ts`, mutant-pinned) with the tab / cash / terminal settle paths in `lib/tabs.ts` · `lib/register-math.ts` · `lib/split-settle.ts` · `lib/terminal.ts` · `lib/voids.ts`; read it as the authority model to EXTEND, never to re-derive.
6. **[DESIGN-RESEARCH.md](DESIGN-RESEARCH.md)** — UX research + evidence, the Sunday north-star teardown, the **paid UI-kit buy-list**, and the component / motion / voice craft bar.
7. **[../DESIGN-LANGUAGE.md](../DESIGN-LANGUAGE.md)** — the **as-built** design language (M1 → W22): one selection vocabulary (the lit-gold cap), the motion idioms, the optimistic doctrine, the honesty bar, the warm-paper depth (two-tier `--sh-paper`; `PaperAmbient` on a **non-isolating** host), receipt language. Research above says what to aim for; this says what the app already speaks — read it before ANY visual/motion/copy work. Forward slate: [`../W22_DESIGN_PROPOSAL.md`](../W22_DESIGN_PROPOSAL.md) (W22a **shipped**; b–f open).
8. **[FREE-KIT-MAP.md](FREE-KIT-MAP.md)** — the $0/mo stack (the free counterpart to the paid kits).
9. **[../prototype/v7.2.html](../prototype/v7.2.html)** — the canonical **visual / interaction reference** (open in a browser). Graded ≈ 4.3/5; the real app should match its feel. **v7.2 covers the DINER path only** — the surfaces below have their own W0 design sources:
10. **[SPEC-KDS.md](SPEC-KDS.md) · [SPEC-GROCERY.md](SPEC-GROCERY.md) · [SPEC-KIOSK.md](SPEC-KIOSK.md)** — the W0 design sources for the kitchen/expo/order-ready board, the grocery market (browse/scan/exit), and the kiosk mode — benchmark-grounded (Toast/Square/Fresh KDS · Sam's Club/Weee! · McDonald's/Bite/Sweetgreen). Score staff surfaces against RUBRIC's **O-axes**. Plan: [`../PRODUCTION_PLAN.md`](../PRODUCTION_PLAN.md); registry: [`../OPEN-ITEMS.md`](../OPEN-ITEMS.md).

## The rest of the map

- **Engineering memory:** [`.claude/LEARNINGS.md`](../../.claude/LEARNINGS.md) + [`.claude/ERROR_HISTORY.md`](../../.claude/ERROR_HISTORY.md) — loaded at session start by a hook. Running rules + recent traps.
- **Build architecture (already in-repo):** [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), [`docs/BACKEND_ARCHITECTURE.md`](../BACKEND_ARCHITECTURE.md), [`docs/REVIEW.md`](../REVIEW.md), [`docs/WORKFLOW.md`](../WORKFLOW.md), [`docs/GROCERY_SCANGO.md`](../GROCERY_SCANGO.md) — plus [`docs/DATA_RECONCILIATION.md`](../DATA_RECONCILIATION.md), which is **superseded** history (the two apps run separate Supabase projects now; `BACKEND_ARCHITECTURE.md` is the live model). Where the build actually stands, and what's next: [`docs/HANDOFF.md`](../HANDOFF.md). Plan: [`ROADMAP.md`](../../ROADMAP.md).
- **Not in git (Cowork only — ask Min):** the v1→v7 prototype lineage + Design Hub, the full decision log, and the POS strategy deep-dives (vendor evaluation, the menu/grocery tax-map spreadsheet, SNAP/Forage onboarding, the dual-pricing plan, the build-vs-buy memo). The **build-relevant facts** from all of those are distilled into `RESEARCH-DIGEST.md` — you shouldn't need the originals to build.

## Keeping it fresh

This is the **canonical, published** copy of the research — not a mirror. When a decision materially changes, update the digest here in a small "context PR" so it never drifts from what's actually true. Treat it like `LEARNINGS.md`: durable, curated, short.
