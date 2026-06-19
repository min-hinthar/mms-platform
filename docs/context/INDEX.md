# Context — read this first

**Why this folder exists.** Claude Code remote sessions only have `main`. The full research history — the prototype lineage (v1→v7.2), the red-team reports, the strategy deep-dives — lives in Min's Cowork workspace and is **not** in git. This folder is the **distilled, durable** subset a session needs to build correctly. The principle: **conclusions live in git; process stays in Cowork.**

## Read order

1. **[RESEARCH-DIGEST.md](RESEARCH-DIGEST.md)** — the decisions + the facts that constrain the build (business, design, compliance, pricing). Start here.
2. **[QA-CHECKLIST.md](QA-CHECKLIST.md)** — the launch gate. Every milestone exits against it; the PR review + weekly adversarial Action enforce it.
3. **[RUBRIC.md](RUBRIC.md)** — the 10-dimension world-class bar (target ≥ 4.3).
4. **[RED-TEAM.md](RED-TEAM.md)** — the standards + the known traps that shaped the build.
5. **[ORDER-MODEL.md](ORDER-MODEL.md)** — how the order is owned (the table, not the phone), who may edit it (line-state × role), and how voids/refunds are authorized. Forward-looking decisions for the dine-in / tab / low-tech-fallback work.
6. **[DESIGN-RESEARCH.md](DESIGN-RESEARCH.md)** — UX research + evidence, the Sunday north-star teardown, the **paid UI-kit buy-list**, and the component / motion / voice craft bar.
7. **[FREE-KIT-MAP.md](FREE-KIT-MAP.md)** — the $0/mo stack (the free counterpart to the paid kits).
8. **[../prototype/v7.2.html](../prototype/v7.2.html)** — the canonical **visual / interaction reference** (open in a browser). Graded ≈ 4.3/5; the real app should match its feel.

## The rest of the map

- **Engineering memory:** [`.claude/LEARNINGS.md`](../../.claude/LEARNINGS.md) + [`.claude/ERROR_HISTORY.md`](../../.claude/ERROR_HISTORY.md) — loaded at session start by a hook. Running rules + recent traps.
- **Build architecture (already in-repo):** [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), [`docs/BACKEND_ARCHITECTURE.md`](../BACKEND_ARCHITECTURE.md), [`docs/DATA_RECONCILIATION.md`](../DATA_RECONCILIATION.md), [`docs/REVIEW.md`](../REVIEW.md), [`docs/WORKFLOW.md`](../WORKFLOW.md), [`docs/GROCERY_SCANGO.md`](../GROCERY_SCANGO.md). Plan: [`ROADMAP.md`](../../ROADMAP.md).
- **Not in git (Cowork only — ask Min):** the v1→v7 prototype lineage + Design Hub, the full decision log, and the POS strategy deep-dives (vendor evaluation, the menu/grocery tax-map spreadsheet, SNAP/Forage onboarding, the dual-pricing plan, the build-vs-buy memo). The **build-relevant facts** from all of those are distilled into `RESEARCH-DIGEST.md` — you shouldn't need the originals to build.

## Keeping it fresh

This is the **canonical, published** copy of the research — not a mirror. When a decision materially changes, update the digest here in a small "context PR" so it never drifts from what's actually true. Treat it like `LEARNINGS.md`: durable, curated, short.
